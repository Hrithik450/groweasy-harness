import { SignJWT, jwtVerify } from "jose";
import type { PublicUser, User } from "@/lib/db";
import { getUserByUserId } from "@/lib/services";
import { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "ads-easy-session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

const JWT_EXPIRY = "7d";

/** A full user row or its already-sanitized public projection. */
type SessionUser = User | PublicUser;

function getAuthSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Drops the credential hash before a user leaves the auth boundary.
 */
export function toPublicUser(user: SessionUser): PublicUser {
  const { passwordHash: _passwordHash, ...safeUser } = user as User;
  return safeUser;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };
}

/**
 * Signs a short-lived JWT embedding the session user.
 */
export async function createSession(user: SessionUser): Promise<string> {
  const secret = getAuthSecretKey();
  return new SignJWT({ user: toPublicUser(user) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);
}

/**
 * Verifies a session JWT and returns the embedded user, or null if invalid/expired.
 */
export async function verifySession(token: string): Promise<PublicUser | null> {
  const secret = getAuthSecretKey();
  try {
    const { payload } = await jwtVerify(token, secret);
    const u = (payload as { user?: SessionUser }).user;
    if (!u) return null;
    // Tokens minted before the hash was stripped still carry it.
    return toPublicUser(u);
  } catch {
    return null;
  }
}

/**
 * Attaches the session cookie onto a NextResponse.
 */
export async function attachSessionCookie<T extends NextResponse>(
  response: T,
  user: SessionUser,
): Promise<T> {
  const token = await createSession(user);
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}

/**
 * Reads and verifies session from a Request or NextRequest object.
 * Checks cookie first, then falls back to x-anonymous-user-id header.
 */
export async function getSessionFromRequest(
  req: Request | NextRequest,
): Promise<PublicUser | null> {
  try {
    let token: string | undefined;

    // Check if NextRequest has req.cookies
    if ("cookies" in req && typeof req.cookies.get === "function") {
      token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    }

    // Fallback: parse cookie header from standard Request
    if (!token) {
      const cookieHeader = req.headers.get("cookie");
      if (cookieHeader) {
        const cookiesList = cookieHeader.split(";").map((c) => c.trim());
        for (const c of cookiesList) {
          if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
            const rawToken = c.substring(`${SESSION_COOKIE_NAME}=`.length);
            if (rawToken) {
              token = decodeURIComponent(rawToken);
              break;
            }
          }
        }
      }
    }

    if (token) {
      const u = await verifySession(token);
      if (u?.id) {
        const userRes = await getUserByUserId(u.id);
        if (userRes.success && userRes.data) {
          return toPublicUser(userRes.data);
        }
      }
    }

    // Fallback: Check x-anonymous-user-id header
    const anonId = req.headers.get("x-anonymous-user-id");
    if (anonId && anonId.trim()) {
      const anonRes = await getUserByUserId(anonId.trim());
      if (anonRes.success && anonRes.data) {
        return toPublicUser(anonRes.data);
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

// Names the proxy and route handlers were written against. Cookie-store reads
// that need `next/headers` live in `@/lib/auth`'s session.server module.
export const AUTH_SESSION_COOKIE_NAME = SESSION_COOKIE_NAME;

/** {@link sessionCookieOptions} under its original name. */
export function authSessionCookieOptions() {
  return sessionCookieOptions();
}

/** {@link createSession} under its original name. */
export function createAuthSession(user: SessionUser): Promise<string> {
  return createSession(user);
}

/** {@link verifySession} under its original name. */
export function verifyAuthSession(token: string): Promise<PublicUser | null> {
  return verifySession(token);
}

/** {@link attachSessionCookie} under its original name. */
export function attachAuthSession<T extends NextResponse>(
  response: T,
  user: SessionUser,
): Promise<T> {
  return attachSessionCookie(response, user);
}

/** {@link getSessionFromRequest} under its original name. */
export function getAuthSessionFromRequest(
  req: Request | NextRequest,
): Promise<PublicUser | null> {
  return getSessionFromRequest(req);
}
