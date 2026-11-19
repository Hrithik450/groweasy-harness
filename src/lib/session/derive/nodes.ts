/**
 * Flat chat-node projection over the durable session event log.
 *
 * One node per event class, ordered by `seq`; grouping into turn cards is a
 * display concern. Message visibility rules stay in `deriveMessages`.
 *
 * @module @/lib/session/derive/nodes
 */

import { isUIAnswerSource, type ContentBlock } from "@/lib/llm/llm/message";
import type { SessionEvent, TurnEndReason } from "@/lib/core/session/events";
import { deriveMessages, type SessionMessage } from "./messages";
import { assistantTurnSource } from "@/lib/core/agent/assistant.source";
import { classifyUserSource } from "./source";
import type {
  AssistantStepChatNode,
  ChatNode,
  ToolCallChatNode,
  TurnEndChatNode,
  UserChatNode,
} from "@/components/chat/nodes";
import type { TurnStatus } from "@/components/chat/types";
import type { UIBlockSpec } from "@/lib/generative.ui";

/**
 * The block answer travels as one machine-readable JSON text part beside the
 * submitted block; it is for the model, so the chat drops it.
 */
function isBlockAnswerLine(block: ContentBlock): boolean {
  if (block.type !== "text") return false;
  const text = block.text.trim();
  if (!text.startsWith("{")) return false;

  try {
    const parsed = JSON.parse(text) as { blockId?: unknown; values?: unknown };
    return (
      typeof parsed.blockId === "string" &&
      typeof parsed.values === "object" &&
      parsed.values !== null
    );
  } catch {
    return false;
  }
}

function visibleUserContent(content: ContentBlock[]): ContentBlock[] {
  const answersBlock = content.some(
    (block) => block.type === "block" && block.spec.submitted === true,
  );
  if (!answersBlock) return content;
  return content.filter((block) => !isBlockAnswerLine(block));
}

/**
 * Answered block specs keyed by block id.
 *
 * A submitted block must render filled and disabled on reload, so its answered
 * spec replaces the interactive one when the node is emitted.
 */
function answeredSpecs(events: readonly SessionEvent[]): Map<string, UIBlockSpec> {
  const specs = new Map<string, UIBlockSpec>();

  for (const event of events) {
    if (event.type !== "user/message") continue;
    const sourceBlockId = (
      event.data.source as { blockId?: unknown } | undefined
    )?.blockId;

    for (const block of event.data.content) {
      if (block.type !== "block") continue;
      const specId =
        typeof block.spec.id === "string" ? block.spec.id : undefined;
      // Older submissions carried the id only on the message source.
      const key =
        specId ??
        (typeof sourceBlockId === "string" ? sourceBlockId : undefined);
      if (key === undefined) continue;
      specs.set(key, specId === undefined ? { ...block.spec, id: key } : block.spec);
    }
  }

  return specs;
}

/** Parse a tool-call argument string for display. */
function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Reasoning text carried by one assistant message. */
function reasoningText(content: readonly ContentBlock[]): string {
  return content
    .filter((block) => block.type === "reasoning")
    .map((block) => (block.type === "reasoning" ? block.reasoning : ""))
    .join("\n\n")
    .trim();
}

/** Map a durable end reason onto the turn lifecycle. */
function statusFromReason(reason?: TurnEndReason): TurnStatus {
  switch (reason?.kind) {
    case "aborted":
    case "interrupted":
      return "interrupted";
    default:
      return "settled";
  }
}

/**
 * Fold durable events into one ordered stream of typed chat nodes.
 */
export function deriveChatNodes(
  events: readonly SessionEvent[],
  sessionId: string,
): ChatNode[] {
  const derived = new Map<number, SessionMessage>();
  for (const message of deriveMessages(events, { sessionId })) {
    if (message.seq !== undefined) derived.set(message.seq, message);
  }

  const nodes: ChatNode[] = [];
  const answered = answeredSpecs(events);
  // Turns whose content belongs to a block answer, not the transcript.
  const hiddenTurns = new Set<number>();
  const toolsByCallId = new Map<string, ToolCallChatNode>();
  const turnStarts = new Map<number, string>();
  const usageByTurn = new Map<number, AssistantStepChatNode["usage"]>();
  const lastStepByTurn = new Map<number, number>();
  let activeTurn: number | undefined;
  let lastTurn = 0;

  const openTurn = (turn: number): number => {
    activeTurn = turn;
    lastTurn = Math.max(lastTurn, turn);
    return turn;
  };

  const turnFor = (explicit?: number): number => {
    if (explicit !== undefined) return openTurn(explicit);
    if (activeTurn !== undefined) return activeTurn;
    return openTurn(Math.max(lastTurn + 1, 1));
  };

  for (const event of events) {
    const time = new Date(event.time).toISOString();

    switch (event.type) {
      case "turn/start": {
        turnStarts.set(event.data.turn, time);
        openTurn(event.data.turn);
        break;
      }

      case "step/start": {
        openTurn(event.data.turn);
        lastStepByTurn.set(event.data.turn, event.data.step);
        break;
      }

      case "user/message": {
        const message = derived.get(event.seq);
        if (!message || message.message.role !== "user") break;
        if (classifyUserSource(message.message.source) !== "message") break;
        const node: UserChatNode = {
          kind: "user",
          seq: event.seq,
          turn: turnFor(),
          time,
          content: visibleUserContent(message.message.content),
          ...(message.message.source !== undefined
            ? { source: message.message.source }
            : {}),
        };
        nodes.push(node);
        break;
      }

      case "assistant/message": {
        const message = derived.get(event.seq);
        if (!message || message.message.role !== "assistant") break;
        // A reply to a block answer belongs to the block; cron/agent/system
        // turns are automation. Only human turns belong in the transcript.
        const replyOrigin = assistantTurnSource(event.data.message.source);
        if (replyOrigin !== undefined && isUIAnswerSource(replyOrigin)) {
          hiddenTurns.add(event.data.turn);
          break;
        }
        if (
          replyOrigin !== undefined &&
          classifyUserSource({ kind: replyOrigin }) !== "message"
        ) {
          break;
        }
        const turn = event.data.turn;
        openTurn(turn);
        lastStepByTurn.set(turn, event.data.step);
        const usage = event.data.usage ?? event.data.message.usage;
        if (usage !== undefined) usageByTurn.set(turn, usage);
        const reasoning = reasoningText(event.data.message.content);
        const node: AssistantStepChatNode = {
          kind: "assistant-step",
          seq: event.seq,
          turn,
          time,
          step: event.data.step,
          status: "settled",
          content: event.data.message.content.filter(
            (block) => block.type !== "reasoning",
          ),
          ...(reasoning ? { reasoning } : {}),
          ...(usage !== undefined ? { usage } : {}),
        };
        nodes.push(node);
        break;
      }

      case "deliverables/presented": {
        const message = derived.get(event.seq);
        if (!message || message.message.role !== "assistant") break;
        const turn = turnFor(event.data.turn);
        const content = message.message.content.filter(
          (block) => block.type !== "reasoning",
        );
        if (content.length === 0) break;
        nodes.push({
          kind: "assistant-step",
          seq: event.seq,
          turn,
          time,
          step: lastStepByTurn.get(turn) ?? 1,
          status: "settled",
          content,
        });
        break;
      }

      case "tool/call": {
        const node: ToolCallChatNode = {
          kind: "tool-call",
          seq: event.seq,
          turn: event.data.turn,
          time,
          step: event.data.step,
          callId: String(event.data.callId),
          name: event.data.name,
          argumentsRaw: event.data.arguments,
          args: parseArguments(event.data.arguments),
          status: "running",
          startedAt: time,
        };
        openTurn(event.data.turn);
        lastStepByTurn.set(event.data.turn, event.data.step);
        toolsByCallId.set(node.callId, node);
        nodes.push(node);
        break;
      }

      case "tool/result": {
        const callId = String(event.data.message.toolCallId);
        const isError = event.data.message.isError === true;
        const error =
          event.data.error?.reason ??
          event.data.error?.name ??
          (isError ? "Tool execution failed" : undefined);
        const completedAt = time;
        const existing = toolsByCallId.get(callId);

        if (!existing) {
          const node: ToolCallChatNode = {
            kind: "tool-call",
            seq: event.seq,
            turn: event.data.turn,
            time,
            step: event.data.step,
            callId,
            name: event.data.error?.name ?? "unknown_tool",
            argumentsRaw: "{}",
            args: {},
            status: isError ? "error" : "completed",
            data: event.data.message.content,
            ...(error !== undefined ? { error } : {}),
            meta: event.data.meta,
            startedAt: completedAt,
            completedAt,
            durationMs: 0,
          };
          toolsByCallId.set(callId, node);
          nodes.push(node);
          break;
        }

        existing.status = isError ? "error" : "completed";
        existing.data = event.data.message.content;
        if (error !== undefined) existing.error = error;
        existing.meta = event.data.meta;
        existing.completedAt = completedAt;
        existing.durationMs = existing.startedAt
          ? Math.max(0, Date.parse(completedAt) - Date.parse(existing.startedAt))
          : undefined;
        break;
      }

      case "ui/block": {
        const turn = turnFor();
        if (hiddenTurns.has(turn)) break;
        const specId =
          typeof event.data.spec.id === "string"
            ? event.data.spec.id
            : String(event.data.id);
        // An answered block keeps its id but renders the submitted values.
        const submitted =
          answered.get(specId) ??
          answered.get(`${specId}:${event.data.spec.root}`);
        nodes.push({
          kind: "ui-block",
          seq: event.seq,
          turn,
          time,
          messageId: event.data.id,
          spec: submitted ? { ...submitted, id: specId } : event.data.spec,
        });
        break;
      }

      case "turn/end": {
        const turn = event.data.turn;
        const startedAt = turnStarts.get(turn);
        const error =
          event.data.reason.kind === "error"
            ? typeof event.data.reason.error === "string"
              ? event.data.reason.error
              : event.data.reason.error.message
            : event.data.reason.kind === "max-tokens"
              ? "The response hit the maximum token limit."
              : undefined;
        const usage = usageByTurn.get(turn);
        const node: TurnEndChatNode = {
          kind: "turn-end",
          seq: event.seq,
          turn,
          time,
          status: statusFromReason(event.data.reason),
          ...(error !== undefined ? { error } : {}),
          ...(startedAt !== undefined
            ? {
                durationMs: Math.max(
                  0,
                  Date.parse(time) - Date.parse(startedAt),
                ),
              }
            : {}),
          ...(usage !== undefined ? { usage } : {}),
        };
        nodes.push(node);
        activeTurn = undefined;
        break;
      }

      default:
        break;
    }
  }

  // An interrupted turn marks its committed assistant steps too.
  const endStatus = new Map<number, TurnStatus>();
  for (const node of nodes) {
    if (node.kind === "turn-end") endStatus.set(node.turn, node.status);
  }
  for (const node of nodes) {
    if (node.kind === "assistant-step" && endStatus.get(node.turn) === "interrupted") {
      node.status = "interrupted";
    }
  }

  // A turn with nothing visible in it is background work: its tools, its reply
  // and its footer all stay off the transcript.
  const visibleTurns = new Set<number>();
  for (const node of nodes) {
    if (node.kind === "user" || node.kind === "assistant-step") {
      visibleTurns.add(node.turn);
    }
  }

  return nodes
    .filter((node) => visibleTurns.has(node.turn))
    .sort((left, right) => left.seq - right.seq);
}
