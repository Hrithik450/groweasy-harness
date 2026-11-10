/**
 * Shared request identity resolution for the Gateway's HTTP routes.
 *
 * Every OAuth callback and every authenticated route must agree on *who* a
 * request belongs to. The gateway's browser client mints a stable UUIDv7 and
 * persists it in the `oh-user-id` cookie (`@openai-harness/client-connection`'s
 * `USER_ID_COOKIE_NAME`), so a top-level OAuth hop carries the same identity
 * back to the callback. Older/native callers may instead send `x-user-id` (or
 * the legacy `x-anonymous-user-id`) or the `userId`/`anonymousUserId` query.
 *
 * Resolution order, matching the route plugins that previously owned private
 * copies of this logic:
 *
 * 1. a verified `ads-easy-session` cookie, resolved to the stored user;
 * 2. the `oh-user-id` identity cookie;
 * 3. the `x-user-id` / `x-anonymous-user-id` request headers;
 * 4. the `userId` / `anonymousUserId` query parameters.
 *
 * Only a canonical UUIDv7 is accepted from the anonymous carriers, and the
 * value must name an existing user row. A stale or malformed carrier falls
 * through to the next source instead of shadowing a valid one.
 *
 * @module @openai-harness/gateway/request-user
 */

import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { StoredUser } from "@openai-harness/google-account";
import { getUserByUserId } from "@openai-harness/google-account";

import { AUTH_SESSION_COOKIE_NAME, verifyAuthSession } from "./auth";

/**
 * Cookie the browser identity helper persists the anonymous UUIDv7 in
 * (`@openai-harness/client-connection`'s `USER_ID_COOKIE_NAME`).
 */
export const IDENTITY_COOKIE_NAME = "oh-user-id";

/** Canonical RFC 9562 UUIDv7 (version and `10` variant bits). */
export const UUIDV7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Whether a value is a canonical UUIDv7. */
export function isValidUuidV7(value: string): boolean {
  return UUIDV7_PATTERN.test(value);
}

/** One request header, collapsing Node's repeated-header array form. */
export function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** One cookie value from a raw `Cookie` header. */
export function readCookie(
  req: IncomingMessage,
  name: string,
): string | undefined {
  const cookieHeader = headerValue(req.headers, "cookie");
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const entry = part.trim();
    if (!entry.startsWith(`${name}=`)) continue;
    const raw = entry.slice(name.length + 1);
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/** The request URL used for query-parameter identity fallbacks. */
function identityQueryUrl(req: IncomingMessage): URL {
  try {
    return new URL(req.url ?? "/", "http://gateway.internal");
  } catch {
    return new URL("/", "http://gateway.internal");
  }
}

/**
 * Every identity value the request carries, in resolution order.
 *
 * Values are returned even when no user row exists yet, because an OAuth login
 * start carries the id through `state` and the callback creates the row.
 */
export function requestIdentityCandidates(req: IncomingMessage): string[] {
  const candidates: string[] = [];

  const cookie = readCookie(req, IDENTITY_COOKIE_NAME);
  if (cookie !== undefined && isValidUuidV7(cookie)) candidates.push(cookie);

  const header = (
    headerValue(req.headers, "x-user-id") ??
    headerValue(req.headers, "x-anonymous-user-id")
  )?.trim();
  if (header !== undefined && isValidUuidV7(header)) candidates.push(header);

  const url = identityQueryUrl(req);
  for (const value of [
    url.searchParams.get("userId"),
    url.searchParams.get("anonymousUserId"),
  ]) {
    const query = value?.trim();
    if (query !== undefined && isValidUuidV7(query)) candidates.push(query);
  }

  return [...new Set(candidates)];
}

/**
 * Resolve the client's stable anonymous UUIDv7 without touching the store.
 *
 * The first canonical carrier wins; only a canonical UUIDv7 is accepted so a
 * forged value cannot name an arbitrary tenant.
 */
export function requestIdentityUserId(
  req: IncomingMessage,
): string | undefined {
  return requestIdentityCandidates(req)[0];
}

/** Resolve one canonical identity value to its existing user row. */
async function resolveStoredUser(userId: string): Promise<StoredUser | null> {
  try {
    const userRes = await getUserByUserId(userId);
    return userRes.success && userRes.data ? userRes.data : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the authenticated user exactly as the OAuth callbacks do: verify the
 * session cookie, then fall back to the client's stable anonymous UUIDv7 from
 * the identity cookie, headers, or query.
 *
 * @returns the stored user, or `null` when no carrier names an existing row.
 */
export async function getRequestUser(
  req: IncomingMessage,
): Promise<StoredUser | null> {
  const token = readCookie(req, AUTH_SESSION_COOKIE_NAME);
  if (token) {
    try {
      const verified = await verifyAuthSession(token);
      if (verified?.id) {
        const user = await resolveStoredUser(verified.id);
        if (user) return user;
      }
    } catch {
      // An invalid session (or missing AUTH_SECRET) is simply unauthenticated.
    }
  }

  for (const anonymousId of requestIdentityCandidates(req)) {
    const user = await resolveStoredUser(anonymousId);
    if (user) return user;
  }

  return null;
}
