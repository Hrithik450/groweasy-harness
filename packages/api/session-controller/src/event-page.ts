/**
 * Backwards, turn-aligned session history paging.
 *
 * A page always begins on a `turn/start` boundary when one exists, so a client
 * window never starts in the middle of a turn. `maxMessages` bounds the window;
 * `turnWindow` raises the bound until both minima are crossed so a page never
 * splits a requested turn count.
 *
 * This module lives with the Session commands (not the Gateway) because the
 * Gateway only transports the result; the history window is Session behavior.
 *
 * @module @openai-harness/session-controller
 */

import type { SessionEvent } from "@openai-harness/session";
import type {
  SessionEventEntry,
  SessionPageRequest,
} from "@openai-harness/sdk-protocol";

/** Default opening/history window, counted in message-bearing events. */
const DEFAULT_MAX_MESSAGES = 40;

/** One backwards page of session records. */
export interface SessionEventPage {
  readonly records: SessionEventEntry[];
  readonly hasMore: boolean;
}

/** Events that render as one conversation item. */
function isMessageBearing(event: SessionEvent): boolean {
  switch (event.type) {
    case "user/message":
    case "assistant/message":
    case "system/message":
    case "tool/result":
    case "ui/block":
    case "deliverables/presented":
      return true;
    default:
      return false;
  }
}

/**
 * Take the newest turn-aligned window ending at `throughSeq` (inclusive) and
 * strictly before `beforeSeq` (exclusive).
 */
export function pageSessionEvents(
  events: readonly SessionEvent[],
  params: SessionPageRequest,
): SessionEventPage {
  const eligible = events.filter(
    (event) =>
      (params.throughSeq === undefined || event.seq <= params.throughSeq) &&
      (params.beforeSeq === undefined || event.seq < params.beforeSeq),
  );
  if (eligible.length === 0) return { records: [], hasMore: false };

  const maxMessages = Math.max(1, params.maxMessages ?? DEFAULT_MAX_MESSAGES);
  const minMessages = Math.min(
    Math.max(1, params.turnWindow?.minMessages ?? 1),
    maxMessages,
  );
  const minTurns = Math.max(1, params.turnWindow?.minTurns ?? 1);
  const messageBudget = Math.max(maxMessages, minMessages);

  let start = eligible.length;
  let messages = 0;
  let turns = 0;

  // Walk backwards counting conversation items and turn boundaries. Stop at a
  // turn start once the message budget is spent and both minima are crossed.
  while (start > 0) {
    const next = eligible[start - 1]!;
    if (isMessageBearing(next)) messages += 1;
    if (next.type === "turn/start") turns += 1;
    start -= 1;
    if (messages >= messageBudget && turns >= minTurns && next.type === "turn/start") {
      break;
    }
  }

  return {
    records: eligible.slice(start).map((event) => ({ type: "event", event })),
    hasMore: start > 0,
  };
}
