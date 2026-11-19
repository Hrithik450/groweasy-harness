import * as repo from "@/lib/repositories";
import { getDetailBarState } from "@/lib/bar/snapshot";
import { toSessionView, type SessionView } from "@/lib/core/session/view";
import { DEFAULT_SESSIONS } from "./default";
import type { Session, NewSession } from "@/lib/db";
import type { Response } from "./types";
import type { SessionSlug, DefaultSessionConfig } from "@/lib/db";
import type { CompetitorResearchItem } from "@/lib/detail.bar";

/** Saved competitor research, including the brand URL stored by its tool. */
type CompetitorResearchItemWithBrand = CompetitorResearchItem & {
  brandUrl?: string;
};

/**
 * Creates a new session strictly scoped to the authenticated user.
 */
export async function createSession(
  data: NewSession,
): Promise<Response<Session>> {
  try {
    const session = repo.createSession(data);
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
  slug: SessionSlug;
  title: string;
  reuse?: boolean;
  hidden?: boolean;
}): Promise<Response<Session>> {
  try {
    const session = repo.resolveSession(params);
    return { success: true, data: session };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Updates an existing session strictly scoped to the authenticated user.
 * Automatically merges partial session extra and detail bar data with the existing record.
 */
export async function updateSession(
  userId: string,
  sessionId: string,
  updates: Partial<Session>,
): Promise<Response<Session | undefined>> {
  try {
    const data = repo.updateSession(userId, sessionId, updates);
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
): Promise<Response<Session[]>> {
  try {
    const data = repo.getSessionsByUserId(userId);
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
): Promise<Response<Session | undefined>> {
  try {
    const data = repo.getDefaultSession(userId);
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
    data: result.data.map((session) => toSessionView(session)),
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
    data: toSessionView(result.data),
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
    data: toSessionView(result.data),
  };
}

/**
 * Retrieves a session by ID strictly scoped to the authenticated user.
 * Automatically falls back to the default session if not found.
 */
export async function getSessionByUserIdAndSessionId(
  userId: string,
  sessionId: string,
): Promise<Response<Session | undefined>> {
  try {
    const data = repo.getSessionByUserIdAndSessionId(userId, sessionId);
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
): Promise<Response<Session | undefined>> {
  try {
    const data = repo.getSessionByUserIdAndSlug(userId, slug);
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
    const data = repo.deleteSession(userId, sessionId);
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
  sessions: readonly DefaultSessionConfig[] = DEFAULT_SESSIONS,
): Promise<Response<boolean>> {
  try {
    repo.ensureDefaultSessionsByUserId(userId, sessions);
    return { success: true, data: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves all saved competitor research reports across the user's adStrategist session
 * (optionally scoped to a brand domain).
 */
export async function getCompetitorResearches(
  userId?: string,
): Promise<CompetitorResearchItem[]> {
  const researches: CompetitorResearchItem[] = [];
  if (!userId) return researches;

  try {
    const session = repo.getSessionByUserIdAndSlug(userId, "adStrategist");
    if (!session) return researches;

    const detailBar = await getDetailBarState(session.id);

    const allResearches: CompetitorResearchItemWithBrand[] =
      (detailBar.adStrategist?.competitorResearches ??
        []) as CompetitorResearchItemWithBrand[];

    researches.push(...allResearches);
  } catch (err) {
    console.warn("Failed to get competitor researches:", err);
  }

  return researches;
}
