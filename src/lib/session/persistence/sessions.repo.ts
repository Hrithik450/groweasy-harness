/**
 * Session persistence repository.
 * Manages session genesis headers, high-speed listing snapshots, and CRUD operations.
 *
 * @module @/lib/session/persistence/sessions.repo
 */

import {
  getDb,
  users,
  sessions,
  type Session,
  type NewSession,
  type DefaultSessionConfig,
} from "@/lib/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type {
  SessionId,
  SessionHeader,
  SessionPersistenceSnapshot,
} from "@/lib/core/session/types";
import { SESSION_FORMAT_VERSION } from "@/lib/core/session/types";
import { uuidv7 } from "@/lib/utils/uuid";
import { sanitizeUserId } from "@/lib/utils/utils";

/**
 * The persisted row carries the remote OpenAI thread id, which the durable
 * `SessionHeader` contract does not (yet) model. Keep it at runtime while
 * exposing the canonical header shape to callers.
 */
function toSessionHeader(row: {
  id: string;
  userId: string;
  slug: string | null;
  createdAt: string;
}): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: row.id as SessionId,
    userId: row.userId,
    createdAt: new Date(row.createdAt).getTime(),
    agentPreset: row.slug ?? undefined,
    isSeeded: false,
  } as unknown as SessionHeader;
}

export class SessionsRepository {
  /**
   * Creates a new session record tied strictly to the authenticated user ID.
   */
  createSession(params: NewSession): Session {
    const effectiveUserId = sanitizeUserId(params.userId);
    if (!effectiveUserId) {
      throw new Error(
        "Authentication required: user_id must be a valid authenticated user ID.",
      );
    }

    const db = getDb();
    const id = params.id || uuidv7();
    const now = new Date().toISOString();

    return db
      .insert(sessions)
      .values({
        ...params,
        id,
        userId: effectiveUserId,
        title: params.title,
        hidden: params.hidden ?? false,
        createdAt: params.createdAt || now,
        updatedAt: params.updatedAt || now,
      })
      .returning()
      .get();
  }

  /**
   * Resolves an existing session for the given user and purpose, or creates a new one.
   */
  resolveSession(params: {
    userId: string;
    slug: string;
    title: string;
    reuse?: boolean;
    hidden?: boolean;
  }): Session {
    const effectiveUserId = sanitizeUserId(params.userId);
    if (!effectiveUserId) {
      throw new Error(
        "Authentication required: user_id must be a valid authenticated user ID.",
      );
    }

    const { slug, title, reuse = true, hidden = false } = params;
    const db = getDb();

    if (reuse) {
      const existing = db
        .select()
        .from(sessions)
        .where(
          and(eq(sessions.userId, effectiveUserId), eq(sessions.slug, slug)),
        )
        .limit(1)
        .get();

      if (existing) {
        if (params.hidden !== undefined && existing.hidden !== params.hidden) {
          return (
            this.updateSession(effectiveUserId, existing.id, {
              hidden: params.hidden,
            }) || existing
          );
        }
        return existing;
      }
    }

    const now = new Date().toISOString();

    return this.createSession({
      id: uuidv7(),
      userId: effectiveUserId,
      title: title,
      slug: slug,
      hidden: hidden,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Single, unified updater for a session strictly scoped to the authenticated user.
   */
  updateSession(
    userId: string,
    sessionId: string,
    updates: Partial<Session>,
  ): Session | undefined {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return undefined;

    const db = getDb();
    const now = new Date().toISOString();

    return db
      .update(sessions)
      .set({
        ...updates,
        updatedAt: now,
      })
      .where(
        and(eq(sessions.id, sessionId), eq(sessions.userId, effectiveUserId)),
      )
      .returning()
      .get();
  }

  /**
   * Fetches the immutable genesis header for a session.
   */
  getHeader(id: SessionId | string): SessionHeader | null {
    const db = getDb();
    const row = db.select().from(sessions).where(eq(sessions.id, id)).get();

    if (!row) return null;

    return toSessionHeader(row);
  }

  /**
   * High-speed indexed listing for user sidebar.
   * Returns SessionPersistenceSnapshot records with event counts and latest timestamps.
   */
  listUserSessions(
    userId: string,
    options?: { limit?: number; offset?: number; includeHidden?: boolean },
  ): SessionPersistenceSnapshot[] {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return [];

    const db = getDb();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const rows = db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        title: sessions.title,
        slug: sessions.slug,
        hidden: sessions.hidden,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
        eventCount: sql<number>`(SELECT count(*) FROM session_events WHERE session_id = ${sessions.id})`,
      })
      .from(sessions)
      .where(
        options?.includeHidden
          ? eq(sessions.userId, effectiveUserId)
          : and(
              eq(sessions.userId, effectiveUserId),
              eq(sessions.hidden, false),
            ),
      )
      .orderBy(desc(sessions.updatedAt))
      .limit(limit)
      .offset(offset)
      .all();

    return rows.map((row) => ({
      header: toSessionHeader(row),
      title: row.title,
      updatedAt: new Date(row.updatedAt).getTime(),
      eventCount: row.eventCount,
      hidden: row.hidden,
    }));
  }

  /**
   * Returns all visible sessions for a user ordered chronologically.
   */
  getSessionsByUserId(userId: string, includeHidden = false): Session[] {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return [];

    const db = getDb();
    return db
      .select()
      .from(sessions)
      .where(
        includeHidden
          ? eq(sessions.userId, effectiveUserId)
          : and(
              eq(sessions.userId, effectiveUserId),
              eq(sessions.hidden, false),
            ),
      )
      .orderBy(sql`datetime(${sessions.createdAt}) ASC`)
      .all();
  }

  /**
   * Retrieves the user's default/first visible session.
   */
  getDefaultSession(userId: string): Session | undefined {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return undefined;

    const all = this.getSessionsByUserId(effectiveUserId, false);
    return all[0];
  }

  /**
   * Retrieves a single session for a user by slug (e.g. "adStrategist").
   */
  getSessionByUserIdAndSlug(userId: string, slug: string): Session | undefined {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return undefined;

    const db = getDb();
    return db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, effectiveUserId), eq(sessions.slug, slug)))
      .limit(1)
      .get();
  }

  /**
   * Retrieves a session by ID strictly scoped to user, falling back to default.
   */
  getSessionByUserIdAndSessionId(
    userId: string,
    sessionId: string,
  ): Session | undefined {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return undefined;

    const db = getDb();
    const session = db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.id, sessionId), eq(sessions.userId, effectiveUserId)),
      )
      .get();

    return session || this.getDefaultSession(effectiveUserId);
  }

  /**
   * Seeds default agent roles for a newly registered or authenticated user.
   */
  ensureDefaultSessionsByUserId(
    userId: string,
    defaultConfigs?: readonly DefaultSessionConfig[],
  ): void {
    const safeUserId = sanitizeUserId(userId);
    if (!safeUserId || !defaultConfigs || defaultConfigs.length === 0) return;

    const db = getDb();

    db.transaction((tx) => {
      const userRow = tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, safeUserId))
        .get();
      if (!userRow) return;

      const now = new Date().toISOString();

      for (const item of defaultConfigs) {
        const existing = tx
          .select({
            id: sessions.id,
            hidden: sessions.hidden,
            extra: sessions.extra,
          })
          .from(sessions)
          .where(
            and(eq(sessions.userId, safeUserId), eq(sessions.slug, item.slug)),
          )
          .limit(1)
          .get();

        if (existing) {
          const updates: Partial<Session> = {};
          if (item.hidden !== undefined && existing.hidden !== item.hidden) {
            updates.hidden = item.hidden;
          }
          if (item.extra !== undefined && existing.extra !== item.extra) {
            updates.extra = item.extra;
          }
          if (Object.keys(updates).length > 0) {
            tx.update(sessions)
              .set(updates)
              .where(eq(sessions.id, existing.id))
              .run();
          }
          continue;
        }

        tx.insert(sessions)
          .values({
            id: uuidv7(),
            userId: safeUserId,
            title: item.title,
            slug: item.slug,
            hidden: item.hidden ?? item.isHidden ?? false,
            extra: item.extra ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    });
  }

  /**
   * Updates session title.
   */
  updateTitle(id: SessionId | string, title: string): void {
    const db = getDb();
    db.update(sessions)
      .set({ title, updatedAt: new Date().toISOString() })
      .where(eq(sessions.id, id))
      .run();
  }

  /**
   * Links or updates a remote OpenAI thread ID.
   */

  /**
   * Deletes a session strictly scoped to the authenticated user.
   */
  deleteSession(userId: string, sessionId: string): boolean {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return false;

    const db = getDb();
    const result = db
      .delete(sessions)
      .where(
        and(eq(sessions.id, sessionId), eq(sessions.userId, effectiveUserId)),
      )
      .run();

    return result.changes > 0;
  }
}

export const sessionsRepo = new SessionsRepository();

export const createSession = (params: NewSession) =>
  sessionsRepo.createSession(params);
export const resolveSession = (
  params: Parameters<SessionsRepository["resolveSession"]>[0],
) => sessionsRepo.resolveSession(params);
export const updateSession = (
  userId: string,
  sessionId: string,
  updates: Partial<Session>,
) => sessionsRepo.updateSession(userId, sessionId, updates);
export const getSessionsByUserId = (userId: string, includeHidden = false) =>
  sessionsRepo.getSessionsByUserId(userId, includeHidden);
export const getDefaultSession = (userId: string) =>
  sessionsRepo.getDefaultSession(userId);
export const getSessionByUserIdAndSlug = (userId: string, slug: string) =>
  sessionsRepo.getSessionByUserIdAndSlug(userId, slug);
export const getSessionByUserIdAndSessionId = (
  userId: string,
  sessionId: string,
) => sessionsRepo.getSessionByUserIdAndSessionId(userId, sessionId);
export const ensureDefaultSessionsByUserId = (
  userId: string,
  configs?: readonly DefaultSessionConfig[],
) => sessionsRepo.ensureDefaultSessionsByUserId(userId, configs);
export const deleteSession = (userId: string, sessionId: string) =>
  sessionsRepo.deleteSession(userId, sessionId);
