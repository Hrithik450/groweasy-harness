/**
 * Durable idempotency lookup for `SessionPromptRequest.requestId`.
 *
 * The id is persisted on the accepted user message's `source.rpcId`, so a
 * retried request is recognised after a restart instead of only within the
 * lifetime of an in-memory map.
 *
 * @module @/lib/session/prompt.dedupe
 */

import type { SessionId } from "@/lib/core/session/types";
import type { SessionEvent } from "@/lib/core/session/events";
import type { SessionRequestId } from "@/lib/llm/llm/brand";
import type { UserMessage } from "@/lib/llm/llm/message";
import { sessionEventsRepo } from "./persistence/events.repo";

/**
 * In-flight request ids, claimed before the accepted message is committed.
 *
 * Kept on `globalThis` so a dev hot-reload does not forget a running claim.
 */
const globalForPromptClaims = globalThis as unknown as {
  __promptClaims?: Map<string, Set<string>>;
};

const promptClaims = (globalForPromptClaims.__promptClaims ??= new Map());

/**
 * Whether a durable user message was produced by the given prompt request.
 * @param message - any message carrying a source.
 * @param requestId - the client-minted idempotency key.
 */
export function userMessageHasRequestId(
  message: Pick<UserMessage, "source">,
  requestId: SessionRequestId,
): boolean {
  // Every accepted prompt records the id, whatever its source kind: a
  // A block answer is `ui-block` (older logs say `ui-action`), and still idempotent.
  const source = message.source as { rpcId?: unknown } | undefined;
  return source?.rpcId === requestId;
}

/**
 * Whether a session event slice already contains the accepted prompt.
 * @param events - durable events for one session.
 * @param requestId - the client-minted idempotency key.
 */
export function sessionEventsContainRequest(
  events: readonly SessionEvent[],
  requestId: SessionRequestId,
): boolean {
  return events.some(
    (event) =>
      event.type === "user/message" &&
      userMessageHasRequestId(event.data, requestId),
  );
}

/**
 * Read the session ledger and report whether this request was already accepted.
 * @param sessionId - durable session identity.
 * @param requestId - the client-minted idempotency key.
 */
export async function hasAcceptedPrompt(
  sessionId: SessionId | string,
  requestId: SessionRequestId,
): Promise<boolean> {
  const events = await sessionEventsRepo.getEvents(sessionId);
  return sessionEventsContainRequest(events, requestId);
}

/**
 * Claim a prompt's identity before its message is committed.
 *
 * Returns false when the request is already in the log or already claimed in
 * this process; otherwise records the claim and returns true.
 *
 * @param sessionId - durable session identity.
 * @param requestId - the client-minted idempotency key.
 */
export async function claimPromptRequest(
  sessionId: SessionId | string,
  requestId: SessionRequestId,
  events?: readonly SessionEvent[],
): Promise<boolean> {
  const key = String(sessionId);
  let claims = promptClaims.get(key);
  if (!claims) {
    claims = new Set<string>();
    promptClaims.set(key, claims);
  }

  // Claim synchronously so two in-process retries cannot both pass.
  if (claims.has(requestId)) return false;
  claims.add(requestId);

  try {
    const accepted = events
      ? sessionEventsContainRequest(events, requestId)
      : await hasAcceptedPrompt(key, requestId);
    if (accepted) {
      releasePromptRequest(key, requestId);
      return false;
    }
  } catch (error) {
    releasePromptRequest(key, requestId);
    throw error;
  }

  return true;
}

/** Release a claim; safe when the request was never claimed. */
export function releasePromptRequest(
  sessionId: SessionId | string,
  requestId: SessionRequestId,
): void {
  const key = String(sessionId);
  const claims = promptClaims.get(key);
  if (!claims) return;

  claims.delete(requestId);
  if (claims.size === 0) promptClaims.delete(key);
}

/** Whether an event already answers the given interactive block. */
function eventAnswersBlock(event: SessionEvent, blockId: string): boolean {
  if (event.type !== "user/message") return false;
  const source = event.data.source as { blockId?: unknown } | undefined;
  if (source?.blockId === blockId) return true;

  // Older submissions recorded the id only on the content block, before the
  // source carried it; without this scan those blocks would accept a second
  // answer.
  return event.data.content.some(
    (block) => block.type === "block" && block.spec.id === blockId,
  );
}

/**
 * Whether a session event slice already contains an answer to the block.
 * @param events - durable events for one session.
 * @param blockId - the block the submission names.
 */
export function sessionEventsAnswerBlock(
  events: readonly SessionEvent[],
  blockId: string,
): boolean {
  return events.some((event) => eventAnswersBlock(event, blockId));
}
