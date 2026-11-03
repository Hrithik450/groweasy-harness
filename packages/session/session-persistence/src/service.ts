/**
 * Session domain service.
 *
 * Thin, fail-soft wrappers over {@link SessionsRepository}: every operation
 * returns a {@link Response} instead of throwing, and the `*View` variants map
 * the stored row to the wire-safe `SessionView` and validate it at the
 * boundary. The repository owns the query semantics; this module owns the
 * application-facing contract.
 *
 * @module @openai-harness/session-persistence
 */

import type { SessionView } from "@openai-harness/session";
import { sessionViewSchema } from "./view.contracts";
import {
  createSession as createSessionRecord,
  deleteSession as deleteSessionRecord,
  ensureDefaultSessionsByUserId,
  getDefaultSession as getDefaultSessionRecord,
  getSessionByUserIdAndSessionId as getSessionByUserIdAndSessionIdRecord,
  getSessionByUserIdAndSlug as getSessionByUserIdAndSlugRecord,
  getSessionsByUserId as getSessionsByUserIdRecord,
  resolveSession as resolveSessionRecord,
  updateSession as updateSessionRecord,
} from "./repository";
import type {
  DefaultSessionConfig,
  NewSessionRecord,
  Response,
  SessionRecord,
} from "./types";
import { toSessionView } from "./view";

/**
 * Creates a new session strictly scoped to the authenticated user.
 */
export async function createSession(
  data: NewSessionRecord,
): Promise<Response<SessionRecord>> {
  try {
    const session = await createSessionRecord(data);
    return { success: true, data: session };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Resolves or creates a session for the specified user and purpose.
 */
export async function resolveSession(params: {
  userId: string;
  slug: string;
  title: string;
  reuse?: boolean;
  hidden?: boolean;
}): Promise<Response<SessionRecord>> {
  try {
    const session = await resolveSessionRecord(params);
    return { success: true, data: session };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Updates an existing session strictly scoped to the authenticated user.
 */
export async function updateSession(
  userId: string,
  sessionId: string,
  updates: Partial<SessionRecord>,
): Promise<Response<SessionRecord | undefined>> {
  try {
    const data = await updateSessionRecord(userId, sessionId, updates);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Returns all sessions for the given authenticated user.
 */
export async function getSessionsByUserId(
  userId: string,
): Promise<Response<SessionRecord[]>> {
  try {
    const data = await getSessionsByUserIdRecord(userId);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves the user's default/first session using an efficient single-row query.
 */
export async function getDefaultSession(
  userId: string,
): Promise<Response<SessionRecord | undefined>> {
  try {
    const data = await getDefaultSessionRecord(userId);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Returns all sessions for the given authenticated user in the wire-safe
 * client shape. Use this from server components that pass data into client
 * components; keep `getSessionsByUserId` for server-internal callers.
 */
export async function getSessionsByUserIdView(
  userId: string,
): Promise<Response<SessionView[]>> {
  const result = await getSessionsByUserId(userId);
  if (!result.success || !result.data) {
    return { success: result.success, error: result.error };
  }
  return {
    success: true,
    data: result.data.map((session) =>
      sessionViewSchema.parse(toSessionView(session)),
    ),
  };
}

/**
 * Retrieves the user's default/first session in the wire-safe client shape.
 */
export async function getDefaultSessionView(
  userId: string,
): Promise<Response<SessionView | undefined>> {
  const result = await getDefaultSession(userId);
  if (!result.success || !result.data) {
    return { success: result.success, error: result.error };
  }
  return {
    success: true,
    data: sessionViewSchema.parse(toSessionView(result.data)),
  };
}

/**
 * Retrieves a session by ID strictly scoped to the authenticated user in the
 * wire-safe client shape.
 */
export async function getSessionViewByUserIdAndSessionId(
  userId: string,
  sessionId: string,
): Promise<Response<SessionView | undefined>> {
  const result = await getSessionByUserIdAndSessionId(userId, sessionId);
  if (!result.success || !result.data) {
    return { success: result.success, error: result.error };
  }
  return {
    success: true,
    data: sessionViewSchema.parse(toSessionView(result.data)),
  };
}

/**
 * Retrieves a session by ID strictly scoped to the authenticated user.
 * Automatically falls back to the default session if not found.
 */
export async function getSessionByUserIdAndSessionId(
  userId: string,
  sessionId: string,
): Promise<Response<SessionRecord | undefined>> {
  try {
    const data = await getSessionByUserIdAndSessionIdRecord(userId, sessionId);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves a session by its unique slug strictly scoped to the authenticated user.
 */
export async function getSessionByUserIdAndSlug(
  userId: string,
  slug: string,
): Promise<Response<SessionRecord | undefined>> {
  try {
    const data = await getSessionByUserIdAndSlugRecord(userId, slug);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Deletes a session strictly scoped to the authenticated user.
 */
export async function deleteSession(
  userId: string,
  sessionId: string,
): Promise<Response<boolean>> {
  try {
    const data = await deleteSessionRecord(userId, sessionId);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Ensures default sessions exist for the specified user from the provided sessions array.
 */
export async function ensureDefaultSessions(
  userId: string,
  sessions: readonly DefaultSessionConfig[],
): Promise<Response<boolean>> {
  try {
    await ensureDefaultSessionsByUserId(userId, sessions);
    return { success: true, data: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
