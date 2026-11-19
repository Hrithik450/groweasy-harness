/**
 * Guards and parsers for the session journal wire format.
 *
 * Everything here is pure and client-safe: the SSE reader in
 * `use.chat.stream.ts` hands it raw strings and gets typed values back, and the
 * server shapes it emits are validated by the same guards.
 *
 * @module @/lib/utils/journal
 */

import type { SessionEvent } from "@/lib/core/session/events";
import type { AssistantStreamFrame } from "@/lib/core/agent/loop/types";
import type {
  SessionJournalChange,
  SessionJournalPage,
} from "@/lib/session/journal";

/** Whether a JSON value is a plain object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a string field, or the empty string when it is not one. */
export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Parse one JSON payload; a malformed frame is dropped rather than thrown. */
export function parseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch (err) {
    console.warn("[journal] Ignoring malformed SSE frame:", err);
    return null;
  }
}

/** Whether a value is one durable session event. */
export function isSessionEvent(value: unknown): value is SessionEvent {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.seq === "number" &&
    typeof value.time === "number" &&
    isRecord(value.data)
  );
}

/** Whether a value is one page of durable events. */
export function isJournalPage(value: unknown): value is SessionJournalPage {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isSessionEvent) &&
    (value.cursor === null || typeof value.cursor === "string")
  );
}

/** Whether a value is one ephemeral assistant-stream frame. */
export function isAssistantStreamFrame(
  value: unknown,
): value is AssistantStreamFrame {
  if (
    !isRecord(value) ||
    typeof value.attemptId !== "string" ||
    typeof value.revision !== "number"
  ) {
    return false;
  }

  if (value.type === "start") {
    return (
      typeof value.turn === "number" &&
      typeof value.step === "number" &&
      typeof value.startedAfterSeq === "number"
    );
  }
  if (value.type === "chunk") {
    return typeof value.index === "number" && typeof value.time === "number";
  }
  if (value.type === "end") {
    return (
      typeof value.index === "number" &&
      isRecord(value.outcome) &&
      (value.outcome.kind === "committed" || value.outcome.kind === "abandoned")
    );
  }
  return false;
}

/** Parse one journal publication; malformed input is ignored. */
export function parseJournalChange(
  value: unknown,
): SessionJournalChange | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  switch (value.type) {
    case "replace":
    case "prepend":
      if (!isJournalPage(value.page) || typeof value.hasMore !== "boolean") {
        return null;
      }
      return { type: value.type, page: value.page, hasMore: value.hasMore };
    case "append":
      return isSessionEvent(value.entry)
        ? { type: "append", entry: value.entry }
        : null;
    case "assistant-stream":
      return isAssistantStreamFrame(value.frame)
        ? { type: "assistant-stream", frame: value.frame }
        : null;
    default:
      return null;
  }
}

/** Read the message out of one `transport/error` frame. */
export function parseTransportError(data: string): string {
  const parsed = parseJson(data);
  if (isRecord(parsed)) {
    const message = asString(parsed.error);
    if (message) return message;
  }
  return "Turn execution failed on server";
}
