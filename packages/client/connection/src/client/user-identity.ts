/**
 * Browser-side persistent anonymous user id.
 *
 * Every client has a stable UUIDv7 from its first request. The id is persisted
 * in `localStorage` (guarded: private modes and policy can throw) and in a
 * cookie, so a top-level navigation such as the Google OAuth redirect carries
 * the same identity to the gateway. When the gateway names the id it resolved
 * in an `x-user-id` response header, {@link adoptClientUserId} keeps that id.
 *
 * @module @openai-harness/client-connection/client/user-identity
 */

import {
  isUuidV7,
  mintUuidv7,
  USER_ID_COOKIE_NAME,
} from "../user-id";

/** `localStorage` key holding the persistent UUIDv7. */
export const USER_ID_STORAGE_KEY = "openai-harness.user.id.v7";

/** Cookie lifetime, matching the reference's ten-year persistence. */
const USER_ID_COOKIE_MAX_AGE_SECONDS = 315_360_000;

/** Read a validated UUIDv7 from `localStorage`, tolerating blocked storage. */
function readStoredUserId(): string | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    const stored = localStorage.getItem(USER_ID_STORAGE_KEY);
    return isUuidV7(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** Persist the id to `localStorage`, ignoring quota/policy failures. */
function writeStoredUserId(id: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(USER_ID_STORAGE_KEY, id);
  } catch {
    // Storage is unavailable in this context; the cookie still carries the id.
  }
}

/** Read a validated UUIDv7 from `document.cookie`, if a document exists. */
function readCookieUserId(): string | undefined {
  try {
    if (typeof document === "undefined" || typeof document.cookie !== "string") {
      return undefined;
    }
    const match = new RegExp(
      `(?:^|;\\s*)${USER_ID_COOKIE_NAME}=([^;]+)`,
    ).exec(document.cookie);
    const raw = match?.[1];
    if (raw === undefined) return undefined;
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Keep the raw value when it is not valid percent-encoding.
    }
    return isUuidV7(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Write the cookie so server navigations and upgrades receive the id. */
function writeCookieUserId(id: string): void {
  try {
    if (typeof document === "undefined") return;
    document.cookie =
      `${USER_ID_COOKIE_NAME}=${id}` +
      `; Path=/; Max-Age=${USER_ID_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Sandboxed documents can reject cookie writes.
  }
}

/**
 * Read the persisted UUIDv7 without minting one.
 * @returns the stored id, or undefined when the client has none yet.
 */
export function peekClientUserId(): string | undefined {
  return readStoredUserId() ?? readCookieUserId();
}

/**
 * Persist a UUIDv7 to both storage carriers.
 * @param id - candidate id; anything that is not a UUIDv7 is ignored.
 */
export function persistClientUserId(id: string): void {
  if (!isUuidV7(id)) return;
  writeStoredUserId(id);
  writeCookieUserId(id);
}

/**
 * Get the client's stable UUIDv7, minting and persisting one when absent.
 * @returns the persistent user id.
 */
export function getClientUserId(): string {
  const existing = peekClientUserId();
  if (existing !== undefined) {
    // Refresh the other carrier in case only one survived storage pruning.
    persistClientUserId(existing);
    return existing;
  }
  const minted = mintUuidv7();
  persistClientUserId(minted);
  return minted;
}

/**
 * Adopt the id a server resolved when this client has none.
 * @param id - `x-user-id` response header value, or null.
 */
export function adoptClientUserId(id: string | null | undefined): void {
  if (!isUuidV7(id)) return;
  if (peekClientUserId() !== undefined) return;
  persistClientUserId(id);
}
