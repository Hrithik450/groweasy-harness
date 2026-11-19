/**
 * Pure authentication token helpers.
 *
 * These functions deliberately have no dependency on `next/*` so they can be
 * used by the standalone gateway process as well as the Next application.
 * Cookie helpers that need a request/response object live in
 * `@/lib/auth/session`; helpers that read the `next/headers` cookie store live
 * in `@/lib/auth/session.server`.
 *
 * @module @/lib/auth/token
 */

import { SignJWT, jwtVerify } from "jose";
import type { User } from "@/lib/db";

export const AUTH_SESSION_COOKIE_NAME = "ads-easy-session";
export const AUTH_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const JWT_EXPIRY = "7d";

export function getAuthSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Signs a short-lived JWT embedding the authenticated user.
 */
export async function createAuthSession(user: User): Promise<string> {
  const secret = getAuthSecretKey();
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);
}

/**
 * Verifies an auth session JWT and returns the embedded user, or null if
 * invalid/expired.
 */
export async function verifyAuthSession(token: string): Promise<User | null> {
  const secret = getAuthSecretKey();
  try {
    const { payload } = await jwtVerify(token, secret);
    const u = (payload as { user: User }).user;
    if (!u) return null;
    return u;
  } catch {
    return null;
  }
}
