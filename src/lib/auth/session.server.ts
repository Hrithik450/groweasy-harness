/**
 * Server-only session helpers backed by the Next.js `cookies()` store.
 *
 * These functions must only be imported from Server Components, route handlers,
 * or server actions. Pure JWT helpers and response-cookie helpers live in
 * `@/lib/auth/session`, which has no `next/headers` dependency and is safe for
 * client-facing barrels.
 *
 * @module @/lib/auth/session.server
 */

import { cookies } from "next/headers";
import type { PublicUser, User } from "@/lib/db";
import { getUserByUserId } from "@/lib/services";
import {
  SESSION_COOKIE_NAME,
  createSession,
  sessionCookieOptions,
  toPublicUser,
  verifySession,
} from "./session";

/**
 * Sets the session cookie using the Next.js cookies() API.
 */
export async function setSessionCookie(user: User | PublicUser): Promise<void> {
  const token = await createSession(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

/**
 * Clears the session cookie.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Reads and verifies the current session user from incoming cookies.
 */
export async function getSessionFromCookies(): Promise<PublicUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    const u = await verifySession(token);
    if (!u?.id) return null;
    const res = await getUserByUserId(u.id);
    return res.success && res.data ? toPublicUser(res.data) : null;
  } catch {
    return null;
  }
}
