/**
 * Pure turn-based projections for the session event log and surface layers.
 * Groups events and conversation items into structured TurnNodes with
 * collapsible intermediate process steps and settled answers.
 *
 * @module @openai-harness/session-projection/derive/turns
 */

import type { SessionEvent } from "@openai-harness/session";
import type { ContentBlock } from "@openai-harness/llm";
import { classifyUserSource, type SurfaceItem } from "./surface";
import type {
  TurnNode,
  StepProcessNode,
  ToolActivityItem,
  ProcessCategory,
  ProcessSummary,
} from "./types";
import { MessageId } from "@openai-harness/llm";
import { SessionId } from "@openai-harness/session";

/**
 * Classifies tool name into standard process categories matching DeepSeek harness rules.
 */
export function classifyToolCategory(name: string): ProcessCategory {
  if (name === "read") return "read";
  if (name === "read_image" || name === "read_images") return "readImage";
  if (name === "grep" || name === "glob" || name.endsWith("_inspect")) return "search";
  if (name === "write") return "write";
  if (name === "edit" || name === "apply_patch") return "edit";
  if (
    name === "bash" ||
    name === "pwsh" ||
    name === "exec_command" ||
    name === "write_stdin" ||
    name.startsWith("terminal_")
  ) {
    return "commands";
  }
  if (name === "run_code") return "code";
  if (name === "web_search" || name === "alternate_web_search") return "webSearch";
  if (name === "web_fetch" || name === "web_scrape" || name === "alternate_web_scrape") {
    return "webFetch";
  }
  if (name === "subagent" || name.startsWith("subagent_")) return "subagents";
  if (
    name === "todo_write" ||
    name === "create_goal" ||
    name === "update_goal" ||
    name === "get_goal"
  ) {
    return "plan";
  }
  if (name === "ask_user_question" || name === "request_user_input") return "questions";
  return "tools";
}

const CATEGORY_CLOSED_LABELS: Record<ProcessCategory, string> = {
  read: "Read files",
  readImage: "Read images",
  search: "Searched code",
  write: "Wrote files",
  edit: "Edited files",
  commands: "Ran commands",
  code: "Ran code",
  webSearch: "Searched the web",
  webFetch: "Visited web pages",
  subagents: "Coordinated subagents",
  plan: "Updated the plan",
  questions: "Asked questions",
  tools: "Called tools",
};

/**
 * Derives the disclosure summary title for a process fold (e.g. "Thought for 3s • Used 2 tools").
 */
export function summarizeProcess(
  steps: readonly StepProcessNode[],
  durationMs?: number,
  isRunning = false,
): ProcessSummary {
  let toolCount = 0;
  let hasReasoning = false;
  const counts = new Map<ProcessCategory, number>();

  for (const step of steps) {
    if (step.reasoning && step.reasoning.trim().length > 0) {
      hasReasoning = true;
    }
    for (const tool of step.tools) {
      toolCount++;
      const cat = classifyToolCategory(tool.name);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }

  const categories = Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  let title = "";

  if (isRunning) {
    const runningTool = steps
      .flatMap((s) => s.tools)
      .findLast((t) => t.status === "running");

    if (runningTool) {
      title = `Running ${runningTool.name.replace(/_/g, " ")}...`;
    } else if (hasReasoning) {
      title = "Thinking...";
    } else {
      title = "Working...";
    }
  } else {
    const parts: string[] = [];

    if (durationMs !== undefined && durationMs > 0) {
      const seconds = Math.max(1, Math.round(durationMs / 1000));
      parts.push(`Thought for ${seconds}s`);
    } else if (hasReasoning) {
      parts.push("Thought");
    }

    if (toolCount > 0) {
      if (categories.length === 1) {
        const single = categories[0];
        const label = CATEGORY_CLOSED_LABELS[single.category] || "Called tools";
        parts.push(single.count === 1 ? label : `${label} (${single.count})`);
      } else {
        parts.push(`Used ${toolCount} tool${toolCount === 1 ? "" : "s"}`);
      }
    }

    title = parts.length > 0 ? parts.join(" • ") : "Process completed";
  }

  return {
    title,
    toolCount,
    hasReasoning,
    categories,
    durationMs,
  };
}

/**
 * Applies a `ui/block` event to a content list.
 *
 * Blocks are identified by the id of the event that rendered them; a later
 * event with the same id (an interaction update, for example) replaces the
 * prior block at its original position instead of appending a duplicate.
 */
function upsertBlock(
  content: readonly ContentBlock[],
  block: ContentBlock,
): ContentBlock[] {
  if (block.type !== "block" || block.id === undefined) {
    return [...content, block];
  }
  const index = content.findIndex(
    (existing) =>
      existing.type === "block" && existing.id !== undefined && existing.id === block.id,
  );
  if (index === -1) return [...content, block];
  const next = [...content];
  next[index] = block;
  return next;
}

function parseJsonSafe(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Pure projection from monotonic SessionEvents to TurnNode[].
 */
export function foldEventsToTurns(
  events: readonly SessionEvent[],
  options: {
    sessionId: SessionId | string;
    defaultCollapsedCompleted?: boolean;
  },
): TurnNode[] {
  const sessionId = SessionId(options.sessionId);
  const turns = new Map<number, TurnNode>();
  let currentTurnNumber = 0;

  function ensureTurn(turnNum: number, sessionId: string): TurnNode {
    let node = turns.get(turnNum);
    if (!node) {
      node = {
        turn: turnNum,
        sessionId,
        status: "running",
        inputs: [],
        processSteps: [],
        isProcessCollapsed: false,
      };
      turns.set(turnNum, node);
    }
    return node;
  }

  function ensureStep(turn: TurnNode, stepNum: number): StepProcessNode {
    let step = turn.processSteps.find((s) => s.step === stepNum);
    if (!step) {
      step = {
        step: stepNum,
        status: "running",
        tools: [],
      };
      turn.processSteps.push(step);
      turn.processSteps.sort((a, b) => a.step - b.step);
    }
    return step;
  }

  for (const event of events) {
    const createdAt = new Date(event.time).toISOString();

    switch (event.type) {
      case "turn/start": {
        currentTurnNumber = event.data.turn;
        const turn = ensureTurn(currentTurnNumber, sessionId);
        turn.status = "running";
        turn.startedAt = createdAt;
        break;
      }

      case "turn/end": {
        const turnNum = event.data.turn;
        const turn = ensureTurn(turnNum, sessionId);
        const reason = event.data.reason;
        // `interrupted` is synthesized when a turn's writer died with its
        // process (crash or restart). The generation stopped; it did not fail,
        // and the generic error banner would misreport it as a failure.
        turn.status =
          reason.kind === "completed"
            ? "completed"
            : reason.kind === "aborted" || reason.kind === "interrupted"
              ? "aborted"
              : "error";

        if (reason.kind === "error") {
          turn.error =
            typeof reason.error === "string"
              ? reason.error
              : reason.error?.message;
        }

        turn.completedAt = createdAt;
        if (turn.startedAt && turn.completedAt) {
          turn.durationMs = Math.max(
            0,
            new Date(turn.completedAt).getTime() -
              new Date(turn.startedAt).getTime(),
          );
        }

        // Collapse process fold by default when turn completes successfully
        if (options?.defaultCollapsedCompleted !== false && turn.status === "completed") {
          turn.isProcessCollapsed = true;
        }
        break;
      }

      case "step/start": {
        const turn = ensureTurn(event.data.turn, sessionId);
        const step = ensureStep(turn, event.data.step);
        step.status = "running";
        step.startedAt = createdAt;
        break;
      }

      case "step/end": {
        const turn = ensureTurn(event.data.turn, sessionId);
        const step = ensureStep(turn, event.data.step);
        step.status = "completed";
        step.completedAt = createdAt;
        break;
      }

      case "user/message": {
        const kind = classifyUserSource(event.data.source);
        if (kind === "context") break;
        const turnNum = currentTurnNumber ?? 1;
        const turn = ensureTurn(turnNum, sessionId);
        const item: SurfaceItem = {
          id: event.data.id,
          sessionId,
          seq: event.seq,
          turn: turnNum,
          role: "user",
          message: event.data,
          content: event.data.content,
          hidden: false,
          kind,
          createdAt,
        };
        turn.inputs.push(item);
        break;
      }

      case "tool/call": {
        const turnNum = event.data.turn ?? currentTurnNumber ?? 1;
        const turn = ensureTurn(turnNum, sessionId);
        const stepNum = event.data.step ?? 1;
        const step = ensureStep(turn, stepNum);

        const callId = String(event.data.callId);
        let existing = step.tools.find((t) => t.callId === callId);
        if (!existing) {
          existing = {
            id: callId,
            callId,
            name: event.data.name,
            arguments: event.data.arguments,
            args: parseJsonSafe(event.data.arguments),
            status: "running",
            startedAt: createdAt,
          };
          step.tools.push(existing);
        } else {
          existing.name = event.data.name;
          existing.arguments = event.data.arguments;
          existing.args = parseJsonSafe(event.data.arguments);
        }
        break;
      }

      case "tool/result": {
        const turnNum = event.data.turn ?? currentTurnNumber ?? 1;
        const turn = ensureTurn(turnNum, sessionId);
        const callId = String(event.data.message.toolCallId);
        const isError = Boolean(event.data.message.isError);

        let targetTool: ToolActivityItem | undefined;
        for (const step of turn.processSteps) {
          targetTool = step.tools.find((t) => t.callId === callId);
          if (targetTool) break;
        }

        if (!targetTool) {
          const stepNum = event.data.step ?? 1;
          const step = ensureStep(turn, stepNum);
          targetTool = {
            id: callId,
            callId,
            name: event.data.error?.name || "tool",
            arguments: "{}",
            args: {},
            status: isError ? "error" : "completed",
            startedAt: createdAt,
          };
          step.tools.push(targetTool);
        }

        targetTool.status = isError ? "error" : "completed";
        targetTool.data = event.data.message.content;
        targetTool.error =
          event.data.error?.reason ||
          event.data.error?.name ||
          (isError ? "Tool execution failed" : undefined);
        targetTool.meta = event.data.meta;
        targetTool.completedAt = createdAt;
        if (targetTool.startedAt) {
          targetTool.durationMs = Math.max(
            0,
            new Date(targetTool.completedAt).getTime() -
              new Date(targetTool.startedAt).getTime(),
          );
        }
        break;
      }

      case "ui/block": {
        const turnNum = currentTurnNumber ?? 1;
        const turn = ensureTurn(turnNum, sessionId);
        const block: ContentBlock = {
          type: "block",
          spec: event.data.spec,
          id: event.data.id,
        };
        // A later `ui/block` for the same event id replaces that block in
        // place: the log stays append-only, the surface stays singular.
        const content = upsertBlock(turn.finalAnswer?.content ?? [], block);

        if (turn.finalAnswer) {
          turn.finalAnswer = {
            ...turn.finalAnswer,
            content,
            message: {
              ...turn.finalAnswer.message,
              content,
            } as SurfaceItem["message"],
          };
        } else {
          const id = MessageId(event.data.id);
          turn.finalAnswer = {
            id,
            sessionId,
            seq: event.seq,
            turn: turnNum,
            role: "assistant",
            message: { id, role: "assistant", content },
            content,
            hidden: false,
            kind: "message",
            createdAt,
          };
        }
        break;
      }

      case "assistant/message": {
        const turnNum = event.data.turn;
        const turn = ensureTurn(turnNum, sessionId);
        const stepNum = event.data.step;
        const step = ensureStep(turn, stepNum);

        if (event.data.usage) {
          turn.usage = event.data.usage;
        }

        // Separate reasoning blocks from surface reply content
        const reasoningBlocks = event.data.message.content.filter(
          (c) => c.type === "reasoning",
        );
        if (reasoningBlocks.length > 0) {
          step.reasoning = reasoningBlocks
            .map((b) => (b.type === "reasoning" ? b.reasoning : ""))
            .join("\n\n");
        }

        const surfaceBlocks = event.data.message.content.filter(
          (c) => c.type !== "reasoning",
        );

        if (surfaceBlocks.length > 0) {
          // Tool-emitted UI blocks live outside the assistant text; keep them
          // in front of the newest reply instead of replacing the answer.
          const priorBlocks = (turn.finalAnswer?.content ?? []).filter(
            (block) => block.type === "block",
          );
          const content = [...priorBlocks, ...surfaceBlocks];
          const answerItem: SurfaceItem = {
            id: event.data.message.id,
            sessionId,
            seq: event.seq,
            turn: turnNum,
            step: stepNum,
            role: "assistant",
            message: { ...event.data.message, content },
            content,
            hidden: false,
            kind: "message",
            createdAt,
          };
          turn.finalAnswer = answerItem;
        }
        break;
      }
    }
  }

  return Array.from(turns.values()).sort((a, b) => a.turn - b.turn);
}

/**
 * Pure projection from SurfaceItem[] to TurnNode[].
 * Used for historical chat hydration when only messages are present.
 */
export function foldSurfaceToTurns(
  items: readonly SurfaceItem[],
  sessionId = "default-session",
): TurnNode[] {
  const turns = new Map<number, TurnNode>();
  let currentTurnNumber = 0;

  for (const item of items) {
    if (item.kind === "context") continue;

    if (item.role === "user") {
      const turnNum = item.turn ?? ++currentTurnNumber;
      currentTurnNumber = turnNum;

      let turn = turns.get(turnNum);
      if (!turn) {
        turn = {
          turn: turnNum,
          sessionId: item.sessionId || SessionId(sessionId),
          status: "completed",
          inputs: [],
          processSteps: [],
          isProcessCollapsed: true,
          startedAt: item.createdAt,
        };
        turns.set(turnNum, turn);
      }
      turn.inputs.push(item);
    } else if (item.role === "assistant") {
      const turnNum = item.turn ?? (currentTurnNumber || 1);
      let turn = turns.get(turnNum);
      if (!turn) {
        turn = {
          turn: turnNum,
          sessionId: item.sessionId || SessionId(sessionId),
          status: "completed",
          inputs: [],
          processSteps: [],
          isProcessCollapsed: true,
        };
        turns.set(turnNum, turn);
      }

      // Check for reasoning blocks vs visible content
      const reasoningBlocks = item.content.filter(
        (c) => c.type === "reasoning",
      );
      if (reasoningBlocks.length > 0) {
        const stepNum = item.step ?? 1;
        let step = turn.processSteps.find((s) => s.step === stepNum);
        if (!step) {
          step = { step: stepNum, status: "completed", tools: [] };
          turn.processSteps.push(step);
        }
        step.reasoning = reasoningBlocks
          .map((b) => (b.type === "reasoning" ? b.reasoning : ""))
          .join("\n\n");
      }

      const surfaceBlocks = item.content.filter(
        (c) => c.type !== "reasoning",
      );

      if (surfaceBlocks.length > 0) {
        turn.finalAnswer = {
          ...item,
          content: surfaceBlocks,
        };
      }
      turn.completedAt = item.createdAt;
    }
  }

  return Array.from(turns.values()).sort((a, b) => a.turn - b.turn);
}
