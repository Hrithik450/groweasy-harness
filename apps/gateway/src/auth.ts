/**
 * Authentication composition: the session cookie and the browser-auth seam.
 *
 * Token signing is owned by `@openai-harness/credentials`; the Cookie name,
 * lifetime, and `AUTH_SECRET` read belong to this deployment. The Connection
 * carrier's authentication service is owned by `@openai-harness/client-connection`
 * and is bound here to those facts plus the filesystem user store owned by
 * `@openai-harness/google-account`.
 *
 * @module @openai-harness/gateway/auth
 */

import { Context } from "@deepseek-ai/cordis";
import { DEFAULT_SESSIONS } from "@openai-harness/agent-preset";
import {
  BrowserAuthService as ConnectionBrowserAuthService,
  type BrowserAuth,
} from "@openai-harness/client-connection";
import {
  SessionTokens,
  type AuthSessionUser,
} from "@openai-harness/credentials";
import {
  getOrCreateAnonymousUser,
  getUserByUserId,
  type StoredUser,
} from "@openai-harness/google-account";
import { ensureDefaultSessions } from "@openai-harness/session-persistence";

export type { AuthSessionUser };

/** The cookie carrying the signed session. */
export const AUTH_SESSION_COOKIE_NAME = "ads-easy-session";

/** Session lifetime, in seconds, mirrored by the cookie's `Max-Age`. */
export const AUTH_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** JWT lifetime, matching {@link AUTH_SESSION_MAX_AGE_SECONDS}. */
const JWT_EXPIRY = "7d";

/**
 * Read the HMAC secret from the environment.
 * @returns the encoded secret.
 * @throws when `AUTH_SECRET` is unset.
 */
export function getAuthSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a short-lived JWT embedding the authenticated user.
 * @param user - the account to certify.
 * @returns the signed token.
 */
export async function createAuthSession(user: StoredUser): Promise<string> {
  return new SessionTokens({
    secret: getAuthSecretKey(),
    expiresIn: JWT_EXPIRY,
  }).sign(user);
}

/**
 * Verify an auth-session JWT.
 * @param token - the candidate JWT.
 * @returns the embedded user, or null when invalid or expired.
 */
export async function verifyAuthSession(
  token: string,
): Promise<AuthSessionUser | null> {
  return new SessionTokens({
    secret: getAuthSecretKey(),
    expiresIn: JWT_EXPIRY,
  }).verify(token);
}

export type { BrowserAuth };

/** Users already seeded in this process; seeding is idempotent but not free. */
const seededUsers = new Set<string>();

/**
 * Create the default agent sessions a user owns.
 *
 * Which sessions a tenant starts with is a deployment policy: the packages own
 * how a Session is stored, not which ones a new user gets. Seeding runs at
 * every seam that first observes a user, because it must not depend on which
 * request happens to arrive first.
 *
 * @param userId - the account to seed.
 */
export async function ensureUserSessions(userId: string): Promise<void> {
  if (seededUsers.has(userId)) return;

  const result = await ensureDefaultSessions(userId, DEFAULT_SESSIONS);
  if (!result.success) {
    console.error("[gateway] failed to seed default sessions", {
      userId,
      error: result.error,
    });
    return;
  }
  seededUsers.add(userId);
}

/** Browser authentication bound to the session cookie and user store. */
export class BrowserAuthService extends ConnectionBrowserAuthService {
  constructor(ctx: Context) {
    super(ctx, {
      cookieName: AUTH_SESSION_COOKIE_NAME,
      verifySession: async (token) =>
        (await verifyAuthSession(token))?.id ?? null,
      lookupUser: async (userId) => {
        const userRes = await getUserByUserId(userId);
        return userRes.success && userRes.data ? { id: userRes.data.id } : null;
      },
      // Every first request resolves a stable anonymous UUIDv7; create its
      // record so the request's sessions and connectors attach to one tenant,
      // and give that tenant its default agent sessions.
      ensureUser: async (userId) => {
        const userRes = getOrCreateAnonymousUser(userId);
        if (!userRes.success || !userRes.data) return null;
        await ensureUserSessions(userRes.data.id);
        return { id: userRes.data.id };
      },
    });
  }
}
