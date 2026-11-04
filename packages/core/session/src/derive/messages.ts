/**
 * Pure message-identity projections over the durable session event log.
 *
 * @module @openai-harness/session
 */

import type { MessageId } from "@openai-harness/llm";
import type { Session } from "../session";

/**
 * Find the most recently committed message id for one role.
 *
 * @param session - session whose log is scanned newest-first.
 * @param role - model-visible surface role to match.
 * @returns the latest `MessageId`, or `undefined` when no such message exists.
 */
export function latestMessageId(
  session: Session,
  role: "user" | "assistant",
): MessageId | undefined {
  const events = session.events;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (role === "user" && event.type === "user/message") {
      return event.data.id;
    }
    if (role === "assistant" && event.type === "assistant/message") {
      return event.data.message.id;
    }
  }
  return undefined;
}
