/**
 * Optimistic prompt overlay for the chat stream.
 *
 * A submitted prompt is live until its durable user message commits. The fold
 * is kept pure so the application can replace it through
 * `configureClientSession({ pendingPrompts })`.
 *
 * @module @openai-harness/client-ui-session/internal/pending
 */

import type { SessionEvent } from "@openai-harness/session";

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
