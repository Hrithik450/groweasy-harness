/**
 * Session record repository.
 *
 * Owns session genesis, listing snapshots, and CRUD semantics over a
 * {@link SessionPersistenceBackend}. Session metadata now lives with the log:
 * the backend folds the immutable header plus the latest metadata record, and
 * `list()` scans the session root. There is no sessions table.
 *
 * All methods are asynchronous because the source of truth is a file log.
 *
 * @module @openai-harness/session-persistence
 */

import { randomUUID } from "node:crypto";
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  type SessionHeader,
  type SessionPersistenceSnapshot,
} from "@openai-harness/session";
import type {
  PersistedSession,
  PersistedSessionMetadataPatch,
  SessionPersistenceBackend,
} from "./backend";
import type {
  DefaultSessionConfig,
  NewSessionRecord,
  SessionRecord,
} from "./types";
import {
  requireSessionStore,
  resolveSessionBackend,
  type SessionStore,
} from "./session.store";

/**
 * Normalize an untrusted user id before it reaches session metadata.
 * Mirrors the host's `sanitizeUserId` guard so the domain keeps the same
 * tenancy boundary without importing application utilities.
 * @param userId - untrusted authenticated user id.
 * @returns the sanitized id, or `""` when absent.
 */
function sanitizeUserId(userId?: string): string {
  if (!userId) return "";
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
}

/** Parse an ISO timestamp into non-negative epoch milliseconds. */
function toMillis(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && millis >= 0 ? millis : fallback;
}

/** Map a stored session onto the row shape the RPC surface consumes. */
function toRecord(session: PersistedSession): SessionRecord {
  return {
    id: String(session.header.id),
    userId: session.header.userId ?? "",
    title: session.title,
    slug: session.slug,
    hidden: session.hidden,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
  };
}

/** Build the listing header, preserving the legacy slug→agentPreset mapping. */
function toListingHeader(session: PersistedSession): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: session.header.id,
    ...(session.header.userId !== undefined
      ? { userId: session.header.userId }
      : {}),
    createdAt: session.createdAt,
    ...(session.slug !== null
      ? { agentPreset: session.slug }
      : session.header.agentPreset !== undefined
        ? { agentPreset: session.header.agentPreset }
        : {}),
  };
}

export class SessionsRepository {
  private readonly storeOverride: SessionStore | undefined;
  private readonly backendInstance: SessionPersistenceBackend | undefined;
  private readonly mintIdInstance: (() => string) | undefined;

  /**
   * @param store - host bindings; defaults to the store bound by
   *   {@link configureSessionStore}. Resolution is deferred to first use, so
   *   a process-wide instance can be constructed at import time and still
   *   observe the host's later binding.
   */
  constructor(store?: SessionStore) {
    this.storeOverride = store;
    this.backendInstance = store?.backend;
    this.mintIdInstance = store?.mintId;
  }

  /** The host store, resolved lazily against the process-wide binding. */
  private get store(): SessionStore {
    return this.storeOverride ?? requireSessionStore();
  }

  private get backend(): SessionPersistenceBackend {
    return this.backendInstance ?? resolveSessionBackend(this.store);
  }

  private get mintId(): () => string {
    return this.mintIdInstance ?? this.store.mintId ?? randomUUID;
  }

  /**
   * Create a session tied strictly to the authenticated user ID.
   * @param params - initial record values.
   * @returns the stored record.
   */
  async createSession(params: NewSessionRecord): Promise<SessionRecord> {
    const effectiveUserId = sanitizeUserId(params.userId);
    if (!effectiveUserId) {
      throw new Error(
        "Authentication required: user_id must be a valid authenticated user ID.",
      );
    }

    const id = params.id ?? this.mintId();
    const now = Date.now();
    const createdAt = toMillis(params.createdAt, now);
    const updatedAt = toMillis(params.updatedAt, now);

    await this.backend.create(
      {
        version: SESSION_FORMAT_VERSION,
        id: SessionId(id),
        userId: effectiveUserId,
        createdAt,
        ...(params.slug ? { agentPreset: params.slug } : {}),
      },
      {
        title: params.title,
        slug: params.slug ?? null,
        hidden: params.hidden ?? false,
        updatedAt,
      },
    );

    const stored = await this.backend.stat(id);
    if (stored === undefined) {
      throw new Error(`session "${id}" disappeared immediately after creation`);
    }
    return toRecord(stored);
  }

  /**
   * Resolve an existing session for the given user and purpose, or create one.
   * @param params - slug/title and reuse policy.
   */
  async resolveSession(params: {
    userId: string;
    slug: string;
    title: string;
    reuse?: boolean;
    hidden?: boolean;
  }): Promise<SessionRecord> {
    const effectiveUserId = sanitizeUserId(params.userId);
    if (!effectiveUserId) {
      throw new Error(
        "Authentication required: user_id must be a valid authenticated user ID.",
      );
    }

    const { slug, title, reuse = true, hidden = false } = params;

    if (reuse) {
      const existing = await this.getSessionByUserIdAndSlug(
        effectiveUserId,
        slug,
      );
      if (existing) {
        if (params.hidden !== undefined && existing.hidden !== params.hidden) {
          return (
            (await this.updateSession(effectiveUserId, existing.id, {
              hidden: params.hidden,
            })) ?? existing
          );
        }
        return existing;
      }
    }

    return this.createSession({
      id: this.mintId(),
      userId: effectiveUserId,
      title,
      slug,
      hidden,
    });
  }

  /**
   * Update one session strictly scoped to the authenticated user.
   *
   * Only `title`, `slug`, and `hidden` are mutable metadata; identity and
   * creation time are immutable. The stored `updatedAt` always advances.
   *
   * @param userId - authenticated owner.
   * @param sessionId - target session.
   * @param updates - fields to replace.
   * @returns the updated record, or `undefined` when not owned/absent.
   */
  async updateSession(
    userId: string,
    sessionId: string,
    updates: Partial<SessionRecord>,
  ): Promise<SessionRecord | undefined> {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return undefined;

    const existing = await this.backend.stat(sessionId);
    if (existing === undefined) return undefined;
    if (existing.header.userId !== effectiveUserId) return undefined;

    const patch: PersistedSessionMetadataPatch = {
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.slug !== undefined ? { slug: updates.slug } : {}),
      ...(updates.hidden !== undefined ? { hidden: updates.hidden } : {}),
      updatedAt: Date.now(),
    };

    const updated = await this.backend.updateMetadata(sessionId, patch);
    return updated === undefined ? undefined : toRecord(updated);
  }

  /**
   * Fetch the immutable genesis header for a session.
   * @param id - session id.
   * @returns the header, or `null` when the session is absent.
   */
  async getHeader(id: SessionId | string): Promise<SessionHeader | null> {
    const stored = await this.backend.stat(String(id));
    if (stored === undefined) return null;
    return {
      version: SESSION_FORMAT_VERSION,
      id: stored.header.id,
      ...(stored.header.userId !== undefined
        ? { userId: stored.header.userId }
        : {}),
      createdAt: stored.createdAt,
      ...(stored.slug !== null
        ? { agentPreset: stored.slug }
        : stored.header.agentPreset !== undefined
          ? { agentPreset: stored.header.agentPreset }
          : {}),
    };
  }

  /**
   * High-speed listing for the user sidebar, ordered by latest update.
   * @param userId - authenticated owner.
   * @param options - pagination and hidden visibility.
   */
  async listUserSessions(
    userId: string,
    options?: { limit?: number; offset?: number; includeHidden?: boolean },
  ): Promise<SessionPersistenceSnapshot[]> {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return [];

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const sessions = (await this.backend.list())
      .filter(
        (session) => session.header.userId === effectiveUserId,
      )
      .filter(
        (session) =>
          (options?.includeHidden ?? false) || session.hidden === false,
      )
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt ||
          String(left.header.id).localeCompare(String(right.header.id)),
      )
      .slice(offset, offset + limit);

    return sessions.map((session) => ({
      header: toListingHeader(session),
      title: session.title,
      updatedAt: session.updatedAt,
      eventCount: session.eventCount,
      hidden: session.hidden,
    }));
  }

  /**
   * Return all visible sessions for a user ordered chronologically.
   * @param userId - authenticated owner.
   * @param includeHidden - include hidden default sessions.
   */
  async getSessionsByUserId(
    userId: string,
    includeHidden = false,
  ): Promise<SessionRecord[]> {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return [];

    return (await this.backend.list())
      .filter((session) => session.header.userId === effectiveUserId)
      .filter((session) => includeHidden || session.hidden === false)
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt ||
          String(left.header.id).localeCompare(String(right.header.id)),
      )
      .map(toRecord);
  }

  /**
   * Retrieve the user's default/first visible session.
   * @param userId - authenticated owner.
   */
  async getDefaultSession(userId: string): Promise<SessionRecord | undefined> {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return undefined;
    const all = await this.getSessionsByUserId(effectiveUserId, false);
    return all[0];
  }

  /**
   * Retrieve one session for a user by slug (e.g. `"adStrategist"`).
   * @param userId - authenticated owner.
   * @param slug - default-session slug.
   */
  async getSessionByUserIdAndSlug(
    userId: string,
    slug: string,
  ): Promise<SessionRecord | undefined> {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return undefined;

    const matches = (await this.backend.list())
      .filter(
        (session) =>
          session.header.userId === effectiveUserId && session.slug === slug,
      )
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt ||
          String(left.header.id).localeCompare(String(right.header.id)),
      );
    return matches[0] === undefined ? undefined : toRecord(matches[0]);
  }

  /**
   * Retrieve a session by id strictly scoped to the user, falling back to the
   * user's default session.
   * @param userId - authenticated owner.
   * @param sessionId - requested id.
   */
  async getSessionByUserIdAndSessionId(
    userId: string,
    sessionId: string,
  ): Promise<SessionRecord | undefined> {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return undefined;

    const stored = await this.backend.stat(sessionId);
    if (stored !== undefined && stored.header.userId === effectiveUserId) {
      return toRecord(stored);
    }
    return this.getDefaultSession(effectiveUserId);
  }

  /**
   * Seed default agent roles for a newly registered or authenticated user.
   * @param userId - authenticated owner.
   * @param defaultConfigs - sessions to ensure.
   */
  async ensureDefaultSessionsByUserId(
    userId: string,
    defaultConfigs?: readonly DefaultSessionConfig[],
  ): Promise<void> {
    const safeUserId = sanitizeUserId(userId);
    if (!safeUserId || !defaultConfigs || defaultConfigs.length === 0) return;

    if (this.store.userExists !== undefined) {
      const exists = await this.store.userExists(safeUserId);
      if (!exists) return;
    }

    for (const item of defaultConfigs) {
      const existing = await this.getSessionByUserIdAndSlug(
        safeUserId,
        item.slug,
      );
      if (existing) {
        if (item.hidden !== undefined && existing.hidden !== item.hidden) {
          await this.updateSession(safeUserId, existing.id, {
            hidden: item.hidden,
          });
        }
        continue;
      }

      await this.createSession({
        id: this.mintId(),
        userId: safeUserId,
        title: item.title,
        slug: item.slug,
        hidden: item.hidden ?? false,
      });
    }
  }

  /**
   * Update a session's title.
   * @param id - session id.
   * @param title - new title.
   */
  async updateTitle(id: SessionId | string, title: string): Promise<void> {
    await this.backend.updateMetadata(String(id), {
      title,
      updatedAt: Date.now(),
    });
  }

  /**
   * Delete a session strictly scoped to the authenticated user.
   * @param userId - authenticated owner.
   * @param sessionId - target session.
   * @returns whether a session was deleted.
   */
  async deleteSession(userId: string, sessionId: string): Promise<boolean> {
    const effectiveUserId = sanitizeUserId(userId);
    if (!effectiveUserId) return false;

    const stored = await this.backend.stat(sessionId);
    if (stored === undefined || stored.header.userId !== effectiveUserId) {
      return false;
    }
    return this.backend.delete(sessionId);
  }
}

/**
 * Process-wide session record repository.
 *
 * Resolves the host bindings lazily, so importing it before composition is
 * safe; the first call must follow {@link configureSessionStore} and the
 * backend binding.
 */
export const sessionsRepo = new SessionsRepository();

export const createSession = (params: NewSessionRecord) =>
  new SessionsRepository().createSession(params);
export const resolveSession = (
  params: Parameters<SessionsRepository["resolveSession"]>[0],
) => new SessionsRepository().resolveSession(params);
export const updateSession = (
  userId: string,
  sessionId: string,
  updates: Partial<SessionRecord>,
) => new SessionsRepository().updateSession(userId, sessionId, updates);
export const getSessionsByUserId = (userId: string, includeHidden = false) =>
  new SessionsRepository().getSessionsByUserId(userId, includeHidden);
export const getDefaultSession = (userId: string) =>
  new SessionsRepository().getDefaultSession(userId);
export const getSessionByUserIdAndSlug = (userId: string, slug: string) =>
  new SessionsRepository().getSessionByUserIdAndSlug(userId, slug);
export const getSessionByUserIdAndSessionId = (
  userId: string,
  sessionId: string,
) => new SessionsRepository().getSessionByUserIdAndSessionId(userId, sessionId);
export const ensureDefaultSessionsByUserId = (
  userId: string,
  configs?: readonly DefaultSessionConfig[],
) => new SessionsRepository().ensureDefaultSessionsByUserId(userId, configs);
export const deleteSession = (userId: string, sessionId: string) =>
  new SessionsRepository().deleteSession(userId, sessionId);
