/**
 * Session history projected from the durable event log.
 *
 * There is no messages table and no `session/message` event: every chat row is
 * derived from the canonical event map in `@/lib/core/session/events`, using
 * the same derivation the live client replays.
 *
 * @module @/lib/services/session.history.service
 */

import type { SessionMessageRole } from "@/lib/core/session/events";
import { interruptedTurnClosers } from "@/lib/core/session/repair";
import { sessionEventsRepo } from "@/lib/session/persistence/events.repo";
import {
  deriveMessages,
  type SessionMessage,
} from "@/lib/session/derive/messages";
import {
  SESSION_JOURNAL_PAGE_BYTES,
  SESSION_JOURNAL_PAGE_TURNS,
  type SessionJournalChange,
} from "@/lib/session/journal";
import type { Response } from "./types";

export interface GetSessionMessagesOptions {
  sessionId: string;
  limit?: number;
  cursor?: string;
  /** Restrict to one role. */
  role?: SessionMessageRole;
  /** Legacy spelling used by the fetch-session-messages tools. */
  isHidden?: boolean;
  hidden?: boolean;
}

/** Load the durable log once and derive its message view. */
async function readDerived(
  sessionId: string,
): Promise<{ messages: SessionMessage[] }> {
  const events = await sessionEventsRepo.getEvents(sessionId);
  // Mirror the crash repair a live load performs so an interrupted tail does
  // not render as an endlessly running turn.
  const balanced = [...events, ...interruptedTurnClosers(events)];
  return {
    messages: deriveMessages(balanced, { sessionId }),
  };
}

/**
 * One durable journal page: up to {@link SESSION_JOURNAL_PAGE_TURNS} turns and
 * {@link SESSION_JOURNAL_PAGE_BYTES} raw bytes, always starting on a
 * `turn/start` so the client never receives half a turn.
 *
 * No cursor returns the newest page as `replace`; a cursor returns the page
 * immediately before it as `prepend`.
 */
export async function getSessionJournal(
  sessionId: string,
  cursor?: string,
): Promise<Response<SessionJournalChange>> {
  try {
    const window = await sessionEventsRepo.getJournalWindow(sessionId, cursor, {
      maxTurns: SESSION_JOURNAL_PAGE_TURNS,
      maxBytes: SESSION_JOURNAL_PAGE_BYTES,
    });
    const page = { entries: window.entries, cursor: window.cursor };
    const data: SessionJournalChange =
      cursor === undefined || cursor === ""
        ? { type: "replace", page, hasMore: window.hasMore }
        : { type: "prepend", page, hasMore: window.hasMore };

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Read a session's messages, derived from durable events, oldest first.
 *
 * Accepts either positional `(sessionId, limit, cursor)` or the legacy options
 * object so existing callers keep working.
 */
export async function getSessionMessages(
  sessionIdOrOptions: string | GetSessionMessagesOptions,
  limit?: number,
  cursor?: string,
): Promise<
  Response<{
    messages: SessionMessage[];
    nextCursor: string | null;
    hasMore: boolean;
  }>
> {
  try {
    const options: GetSessionMessagesOptions =
      typeof sessionIdOrOptions === "string"
        ? { sessionId: sessionIdOrOptions, limit, cursor }
        : sessionIdOrOptions;

    const { messages } = await readDerived(options.sessionId);
    let all = messages;

    if (options.role) {
      all = all.filter((row) => row.message.role === options.role);
    }

    const pageSize = options.limit ?? 20;
    const start = options.cursor ? Number.parseInt(options.cursor, 10) : 0;
    const page = all.slice(start, start + pageSize);
    const next = start + page.length;

    return {
      success: true,
      data: {
        messages: page,
        nextCursor: next < all.length ? String(next) : null,
        hasMore: next < all.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
