/**
 * Live overlays applied on top of the durable turn projection.
 *
 * Two things are not in the log yet while a turn runs: the prompt the browser
 * just submitted (until its durable message commits) and the assistant text of
 * the open step (process-local, published on the assistant stream). Both are
 * merged here so rendering stays a pure function of the event window plus the
 * live stream.
 *
 * The assistant-stream input is a structural overlay, not the controller
 * type: hosts map their own live state onto {@link AssistantStreamOverlay}.
 *
 * @module @openai-harness/session-projection/derive/live
 */

import type { SessionEvent } from "@openai-harness/session";
import { SessionId, SessionSeq } from "@openai-harness/session";
import { MessageId } from "@openai-harness/llm";
import type { SurfaceItem } from "./surface";
import type { TurnNode } from "./types";

/**
 * Compact in-flight assistant text for rendering.
 *
 * Structurally identical to the application session controller's
 * `SessionAssistantStreamState`, so either side can pass its own value.
 */
export interface AssistantStreamOverlay {
  readonly attemptId: string;
  readonly turn: number;
  readonly step: number;
  readonly text: string;
}

/** Backwards-compatible alias for the controller-side name. */
export type SessionAssistantStreamState = AssistantStreamOverlay;

/** One submitted prompt awaiting its durable user message. */
export interface OptimisticPrompt {
  readonly requestId: string;
  readonly text: string;
  readonly createdAt: string;
}

/** Client correlation id persisted on a `user-rpc` message source. */
function messageRpcId(event: SessionEvent): string | undefined {
  if (event.type !== "user/message") return undefined;
  const source = event.data.source as { rpcId?: unknown } | undefined;
  return typeof source?.rpcId === "string" ? source.rpcId : undefined;
}

/** Prompts whose durable message has not landed in the window yet. */
export function pendingPrompts(
  events: readonly SessionEvent[],
  prompts: readonly OptimisticPrompt[],
): OptimisticPrompt[] {
  if (prompts.length === 0) return [];
  const committed = new Set(
    events.map(messageRpcId).filter((id): id is string => id !== undefined),
  );
  return prompts.filter((prompt) => !committed.has(prompt.requestId));
}

/** Adds one optimistic turn carrying the prompts still in flight. */
export function withOptimisticPrompts(
  turns: readonly TurnNode[],
  prompts: readonly OptimisticPrompt[],
  sessionId: string,
): TurnNode[] {
  if (prompts.length === 0) return [...turns];

  const lastTurn = turns[turns.length - 1]?.turn ?? 0;
  const lastSeq = turns[turns.length - 1]?.finalAnswer?.seq ?? 0;
  const sid = SessionId(sessionId);
  const inputs: SurfaceItem[] = prompts.map((prompt, index) => {
    const id = MessageId(`optimistic:${prompt.requestId}`);
    return {
      id,
      sessionId: sid,
      seq: SessionSeq(lastSeq + index + 1),
      role: "user",
      message: {
        id,
        role: "user",
        content: [{ type: "text", text: prompt.text }],
      },
      content: [{ type: "text", text: prompt.text }],
      hidden: false,
      kind: "message",
      createdAt: prompt.createdAt,
    };
  });

  return [
    ...turns,
    {
      turn: lastTurn + 1,
      sessionId,
      status: "running",
      inputs,
      processSteps: [],
      isProcessCollapsed: false,
      startedAt: prompts[0]!.createdAt,
    },
  ];
}

/** Appends the in-flight assistant text to its turn. */
export function withAssistantStream(
  turns: readonly TurnNode[],
  stream: AssistantStreamOverlay | undefined,
): TurnNode[] {
  if (!stream || stream.text.length === 0) return [...turns];

  let index = turns.findIndex((turn) => turn.turn === stream.turn);
  const next = [...turns];
  if (index === -1) {
    next.push({
      turn: stream.turn,
      sessionId: turns[turns.length - 1]?.sessionId ?? "",
      status: "running",
      inputs: [],
      processSteps: [],
      isProcessCollapsed: false,
    });
    index = next.length - 1;
  }

  const turn = next[index]!;
  const answerId = MessageId(stream.attemptId);
  const content = [
    ...(turn.finalAnswer?.content ?? []),
    { type: "text" as const, text: stream.text },
  ];

  next[index] = {
    ...turn,
    finalAnswer: {
      id: answerId,
      sessionId: turn.finalAnswer?.sessionId ?? SessionId(turn.sessionId),
      seq: turn.finalAnswer?.seq ?? SessionSeq(0),
      turn: stream.turn,
      step: stream.step,
      role: "assistant",
      message: { id: answerId, role: "assistant", content },
      content,
      hidden: false,
      kind: "message",
      createdAt: new Date().toISOString(),
    },
  };
  return next;
}
