/**
 * Who produced a user-role message, and whether it is a chat bubble.
 *
 * Pure and client-safe: it reads the message source vocabulary and never
 * touches storage.
 *
 * @module @/lib/session/derive/source
 */

import {
  isPromptDisplay,
  isUIAnswerSource,
  type ContentBlock,
} from "@/lib/llm/llm/message";

/**
 * Where one user-role message came from.
 *
 * - `message` — a human turn (or an assistant answer); rendered as a bubble.
 * - `trigger` — non-human input that starts a turn (cron, agent relay);
 *   rendered as the turn's input, not as a human bubble.
 * - `context` — harness-injected model context, never rendered as a bubble.
 */
export type SourceKind = "message" | "context" | "trigger";

/**
 * Classify one `user/message` source. Absent or human sources are messages;
 * scheduled/agent-relayed inputs are turn triggers; every other durable
 * source kind is model context and never renders as a bubble.
 */
export function classifyUserSource(
  source: { kind?: string; display?: unknown } | undefined,
): SourceKind {
  const kind = source?.kind;
  if (kind === undefined || kind === "user" || isUIAnswerSource(kind)) {
    return "message";
  }
  // A detail-bar action shows its compact display; without one it stays hidden.
  if (kind === "detail-bar") {
    return isPromptDisplay(source?.display) ? "message" : "context";
  }

  if (kind === "cron" || kind === "agent") return "trigger";
  return "context";
}

/**
 * Whether a user message renders as a chat bubble.
 *
 * A block answer is not a bubble, whatever spelling it was written with: new
 * rows name the block on `source.blockId`, older ones used a `ui-*` kind.
 * Classification alone can't decide this — an assistant *reply* to a block
 * answer must still render — so the source object is checked here.
 */
export function isUserBubble(
  source: { kind?: string; [key: string]: unknown } | undefined,
  content?: readonly ContentBlock[],
): boolean {
  if (typeof source?.blockId === "string") return false;
  if (isUIAnswerSource(source?.kind)) return false;
  // Older submissions recorded the block only in the content, not the source.
  if (content?.some((block) => block.type === "block")) return false;
  return classifyUserSource(source) === "message";
}
