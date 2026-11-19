/**
 * Append-only event repository for the session event ledger.
 *
 * Guarantees:
 * - Strictly monotonic sequence numbering per session.
 * - Atomic transaction commit.
 * - Contiguity validation (zero sequence gaps).
 *
 * The domain event union comes from `@/lib/core/session/events`; the SQLite
 * row is storage only and is mapped back to `{ type, seq, time, data }` on
 * read.
 *
 * @module @/lib/session/persistence/events.repo
 */

import { getDb, sessionEvents, sessions } from "@/lib/db";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { SessionId, SessionSeq } from "@/lib/core/session/types";
import type { SessionEvent } from "@/lib/core/session/events";
import { assertContiguous } from "./contract";
import { uuidv7 } from "@/lib/utils/uuid";

/**
 * Runtime events created by the in-memory `Session` carry storage metadata
 * (`id`, `sessionId`, `createdAt`) that is not part of the domain union, and
 * older event shapes predate the `time` field. Only `seq` and the persisted
 * payload are required by the ledger.
 */
type SessionEventWithMeta = Omit<SessionEvent, "time"> & {
  id?: string;
  sessionId?: string;
  createdAt?: string;
  time?: number;
};

export class SessionEventsRepository {
  /**
   * Retrieves the current next-sequence number for a session (0 if empty).
   */
  async getNextSeq(sessionId: SessionId | string): Promise<number> {
    const db = getDb();
    const row = db
      .select({
        maxSeq: sql<number | null>`max(${sessionEvents.seq})`,
      })
      .from(sessionEvents)
      .where(eq(sessionEvents.sessionId, sessionId))
      .get();

    return row?.maxSeq !== null && row?.maxSeq !== undefined
      ? row.maxSeq + 1
      : 0;
  }

  /**
   * Appends an array of contiguous events to the session ledger in an atomic
   * transaction and updates the parent session's `updatedAt` timestamp.
   */
  async appendBatch(
    sessionId: SessionId | string,
    events: readonly SessionEventWithMeta[],
  ): Promise<void> {
    if (events.length === 0) return;

    const db = getDb();
    const now = new Date().toISOString();

    // Read the cursor and append inside one synchronous transaction: better-
    // sqlite3 serialises it, so two fire-and-forget appends cannot both
    // observe the same next sequence.
    db.transaction((tx) => {
      const cursorRow = tx
        .select({
          maxSeq: sql<number | null>`max(${sessionEvents.seq})`,
        })
        .from(sessionEvents)
        .where(eq(sessionEvents.sessionId, sessionId))
        .get();
      const cursor =
        cursorRow?.maxSeq !== null && cursorRow?.maxSeq !== undefined
          ? cursorRow.maxSeq + 1
          : 0;

      assertContiguous(sessionId, events, cursor);

      for (const event of events) {
        const withMeta = event;
        const createdAt = withMeta.createdAt || now;

        tx.insert(sessionEvents)
          .values({
            id: withMeta.id || uuidv7(),
            sessionId,
            seq: event.seq,
            type: event.type,
            // `Session.append` predates the `time` field on the domain type;
            // fall back to its ISO creation stamp for those events.
            time:
              typeof event.time === "number"
                ? event.time
                : Date.parse(createdAt),
            data: event.data as Record<string, unknown>,
            surfaceOp: event.surfaceOp ?? null,
            sourceEventSeqs: event.sourceEventSeqs ?? null,
            createdAt,
          })
          .run();
      }

      tx.update(sessions)
        .set({ updatedAt: now })
        .where(eq(sessions.id, sessionId))
        .run();
    });
  }

  /**
   * Appends a single event to the session ledger.
   */
  async append(
    sessionId: SessionId | string,
    event: SessionEventWithMeta,
  ): Promise<void> {
    await this.appendBatch(sessionId, [event]);
  }

  /**
   * Reads all or a slice of committed events for a session in strict monotonic
   * sequence order.
   */
  async getEvents(
    sessionId: SessionId | string,
    options?: { fromSeq?: number; limit?: number },
  ): Promise<SessionEvent[]> {
    const db = getDb();
    let query = db
      .select()
      .from(sessionEvents)
      .where(
        options?.fromSeq !== undefined
          ? and(
              eq(sessionEvents.sessionId, sessionId),
              gte(sessionEvents.seq, options.fromSeq),
            )
          : eq(sessionEvents.sessionId, sessionId),
      )
      .orderBy(asc(sessionEvents.seq));

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    return query.all().map((row) => {
      const event = {
        type: row.type,
        seq: SessionSeq(row.seq),
        time:
          typeof row.time === "number"
            ? row.time
            : new Date(row.createdAt).getTime(),
        data: row.data,
        ...(row.surfaceOp ? { surfaceOp: row.surfaceOp } : {}),
        ...(row.sourceEventSeqs
          ? { sourceEventSeqs: row.sourceEventSeqs.map(SessionSeq) }
          : {}),
      } as unknown as SessionEvent;

      return event;
    });
  }

  /**
   * Returns the total count of events committed for this session.
   */
  async countEvents(sessionId: SessionId | string): Promise<number> {
    const db = getDb();
    const row = db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(sessionEvents)
      .where(eq(sessionEvents.sessionId, sessionId))
      .get();

    return row?.count ?? 0;
  }
}

export const sessionEventsRepo = new SessionEventsRepository();
