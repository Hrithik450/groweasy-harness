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
 * One durable journal page: the last {@link SESSION_JOURNAL_PAGE_TURNS} turns,
 * however many events they hold.
 *
 * A page always starts on a `turn/start`, so the client never receives half a
 * turn. No cursor returns the newest page as `replace`; a cursor returns the
 * page immediately before it as `prepend`.
 */
export async function getSessionJournal(
  sessionId: string,
  cursor?: string,
): Promise<Response<SessionJournalChange>> {
  try {
    const events = await sessionEventsRepo.getEvents(sessionId);

    let end = events.length;
    if (cursor !== undefined && cursor !== "") {
      const through = Number.parseInt(cursor, 10);
      if (!Number.isFinite(through)) {
        return { success: false, error: "Invalid journal cursor" };
      }
      const after = events.findIndex((event) => event.seq > through);
      end = after < 0 ? events.length : after;
    }

    // Walk back to the start of the tenth turn before the window's end.
    let start = 0;
    let turns = 0;
    for (let index = end - 1; index >= 0; index -= 1) {
      if (events[index]!.type !== "turn/start") continue;
      turns += 1;
      if (turns === SESSION_JOURNAL_PAGE_TURNS) {
        start = index;
        break;
      }
    }

    const entries = events.slice(start, end);
    const page = {
      entries,
      cursor: start > 0 ? String(events[start - 1]!.seq) : null,
    };
    const hasMore = start > 0;
    const data: SessionJournalChange =
      cursor === undefined || cursor === ""
        ? { type: "replace", page, hasMore }
        : { type: "prepend", page, hasMore };

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
