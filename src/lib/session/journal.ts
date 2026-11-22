/**
 * Shared session journal wire contract.
 *
 * Client-safe: type imports only, so the browser stream and the server
 * endpoints speak exactly one vocabulary.
 *
 * @module @/lib/session/journal
 */

import type { SessionEvent } from "@/lib/core/session/events";
import type { AssistantStreamFrame } from "@/lib/core/agent/loop/types";

/** Turns returned per journal page, whatever their event count. */
export const SESSION_JOURNAL_PAGE_TURNS = 10;

/** Raw byte ceiling per journal page; keeps one old megabyte turn off first paint. */
export const SESSION_JOURNAL_PAGE_BYTES = 512 * 1024;

/** SSE event name carrying every {@link SessionJournalChange}. */
export const SESSION_JOURNAL_EVENT = "journal";

/** SSE event name for an out-of-band transport failure. */
export const SESSION_TRANSPORT_ERROR_EVENT = "transport/error";

/** SSE event name for connector status changes, muxed onto the session stream. */
export const SESSION_CONNECTOR_EVENT = "connector";

/** SSE event name for an onboarding-status change. */
export const SESSION_ONBOARDING_EVENT = "onboarding";

/** SSE event name for one detail-bar field replacement. */
export const SESSION_DETAIL_BAR_EVENT = "detail-bar";

/**
 * One publication from the session journal.
 *
 * `replace` and `prepend` carry durable pages; `append` carries one committed
 * event; `assistant-stream` is ephemeral and never durable.
 */
export type SessionJournalChange =
  | { type: "replace"; page: SessionJournalPage; hasMore: boolean }
  | { type: "prepend"; page: SessionJournalPage; hasMore: boolean }
  | { type: "append"; entry: SessionEvent }
  | { type: "assistant-stream"; frame: AssistantStreamFrame };

export interface SessionJournalPage {
  /** Durable events, oldest first. */
  entries: SessionEvent[];
  /** Opaque cursor for the page *before* this one, or null at the start. */
  cursor: string | null;
}

/**
 * Out-of-band transport failure.
 *
 * Never durable and never a {@link SessionJournalChange}: it travels on its own
 * `transport/error` frame.
 */
export interface SessionTransportError {
  error: string;
}
