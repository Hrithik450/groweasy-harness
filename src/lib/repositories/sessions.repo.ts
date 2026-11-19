import {
  getDb,
  users,
  sessions as sessionsTable,
  type Session,
  type NewSession,
} from "@/lib/db";
import { uuidv7 } from "@/lib/utils/uuid";
import { eq, and, sql } from "drizzle-orm";
import { sanitizeUserId } from "@/lib/utils/utils";
import type { DefaultSessionConfig } from "@/lib/db";

const sessions = sessionsTable;

/**
 * Creates a new session tied strictly to the authenticated user ID.
 */
export function createSession(params: NewSession): Session {
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
      extra: params.extra ?? null,
      createdAt: params.createdAt || now,
      updatedAt: params.updatedAt || now,
    })
    .returning()
    .get();
}

/**
 * Resolves an existing session for the given user and purpose, or creates a new one.
 */
export function resolveSession(params: {
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
      .where(and(eq(sessions.userId, effectiveUserId), eq(sessions.slug, slug)))
      .limit(1)
      .get();

    if (existing) {
      if (params.hidden !== undefined && existing.hidden !== params.hidden) {
        return (
          updateSession(effectiveUserId, existing.id, {
            hidden: params.hidden,
          }) || existing
        );
      }
      return existing;
    }
  }

  const now = new Date().toISOString();

  return createSession({
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
 * Supports updating any session field: title, slug, hidden, extra, etc.
 */
export function updateSession(
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
 * Seeds default agent roles for a newly registered or authenticated user.
 * If sessions is empty or not provided, returns without making any updates.
 */
export function ensureDefaultSessionsByUserId(
  userId: string,
  sessions?: readonly DefaultSessionConfig[],
): void {
  const safeUserId = sanitizeUserId(userId);
  if (!safeUserId || !sessions || sessions.length === 0) return;

  const db = getDb();

  db.transaction((tx) => {
    const userRow = tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, safeUserId))
      .get();
    if (!userRow) return;

    const now = new Date().toISOString();

    for (const item of sessions) {
      const existing = tx
        .select({
          id: sessionsTable.id,
          hidden: sessionsTable.hidden,
          extra: sessionsTable.extra,
        })
        .from(sessionsTable)
        .where(
          and(
            eq(sessionsTable.userId, safeUserId),
            eq(sessionsTable.slug, item.slug),
          ),
        )
        .limit(1)
        .get();

      if (existing) {
        const updates: Partial<Session> = {};
        const itemHidden = item.hidden ?? item.isHidden;
        if (itemHidden !== undefined && existing.hidden !== itemHidden) {
          updates.hidden = itemHidden;
        }
        if (item.extra !== undefined && existing.extra !== item.extra) {
          updates.extra = item.extra;
        }
        if (Object.keys(updates).length > 0) {
          tx.update(sessionsTable)
            .set(updates)
            .where(eq(sessionsTable.id, existing.id))
            .run();
        }
        continue;
      }

      tx.insert(sessionsTable)
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
 * Returns all visible sessions for the given authenticated user (excluding hidden background workflow sessions).
 */
export function getSessionsByUserId(userId: string, hidden = false): Session[] {
  const effectiveUserId = sanitizeUserId(userId);
  if (!effectiveUserId) return [];

  const db = getDb();
  const rows = db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      title: sessions.title,
      slug: sessions.slug,
      hidden: sessions.hidden,
      extra: sessions.extra,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
    })
    .from(sessions)
    .where(
      hidden
        ? eq(sessions.userId, effectiveUserId)
        : and(eq(sessions.userId, effectiveUserId), eq(sessions.hidden, false)),
    )
    .orderBy(sql`datetime(${sessions.createdAt}) ASC`)
    .all();

  return rows;
}

/**
 * Retrieves the user's default/first visible session using an efficient query.
 */
export function getDefaultSession(userId: string): Session | undefined {
  const effectiveUserId = sanitizeUserId(userId);
  if (!effectiveUserId) return undefined;

  const all = getSessionsByUserId(effectiveUserId, false);
  return all[0];
}

/**
 * Retrieves a single session for a user by its slug (e.g. "adStrategist").
 */
export function getSessionByUserIdAndSlug(
  userId: string,
  slug: string,
): Session | undefined {
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

/** Retrieves one session row by id, without an ownership check. */
export function getSessionById(sessionId: string): Session | undefined {
  const db = getDb();
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1)
    .get();
}

/**
 * Retrieves a session by id only when this user owns it.
 *
 * No fallback: a route that acts on a named session must never act on a
 * different one because the id was wrong.
 */
export function getOwnedSessionById(
  userId: string,
  sessionId: string,
): Session | undefined {
  const effectiveUserId = sanitizeUserId(userId);
  if (!effectiveUserId) return undefined;

  return getDb()
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.userId, effectiveUserId)),
    )
    .get();
}

/**
 * Retrieves a session by ID strictly scoped to the authenticated user.
 * Automatically falls back to the user's default (first) session if the requested ID does not exist.
 */
export function getSessionByUserIdAndSessionId(
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

  return session || getDefaultSession(effectiveUserId);
}

/**
 * Deletes a session strictly scoped to the authenticated user.
 */
export function deleteSession(userId: string, sessionId: string): boolean {
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
