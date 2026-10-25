/**
 * Browser-side persistent anonymous and official user UUIDv7 management.
 *
 * Guarantees a stable, immutable UUIDv7 stored in localStorage and cookies for
 * anonymous user tracking, automatically linked to Google upon OAuth authentication.
 *
 * @module @deepseek-ai/dsh-client-ui-settings-account/src/client/user-identity
 */

export const USER_ID_STORAGE_KEY = "dsh.user.id.v7";
export const USER_ID_COOKIE_NAME = "dsh-user-id";

const UUIDV7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mint a client-side RFC 9562 UUIDv7 without third-party dependencies.
 *
 * @param timestamp - Unix epoch milliseconds (defaults to Date.now())
 * @returns Formatted UUIDv7 string
 */
export function mintClientUuidv7(timestamp = Date.now()): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[0] = Math.floor(timestamp / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(timestamp / 0x100000000) & 0xff;
  bytes[2] = Math.floor(timestamp / 0x1000000) & 0xff;
  bytes[3] = Math.floor(timestamp / 0x10000) & 0xff;
  bytes[4] = Math.floor(timestamp / 0x100) & 0xff;
  bytes[5] = timestamp & 0xff;
  const hex = Array.from(bytes, (byte, index) => {
    const pinned =
      index === 6
        ? (byte & 0x0f) | 0x70
        : index === 8
          ? (byte & 0x3f) | 0x80
          : byte;
    return pinned.toString(16).padStart(2, "0");
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Read the persistent UUIDv7 from document cookies if present.
 */
function readCookieUserId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = new RegExp(
    `(?:^|;\\s*)${USER_ID_COOKIE_NAME}=([0-9a-fA-F-]+)`,
  ).exec(document.cookie);
  const val = match?.[1];
  return val && UUIDV7_PATTERN.test(val) ? val : undefined;
}

/**
 * Set persistent cookie for sync across requests.
 */
function writeCookieUserId(id: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${USER_ID_COOKIE_NAME}=${id}; Path=/; Max-Age=315360000; SameSite=Lax`;
  } catch {
    // Ignore sandbox cookie restrictions
  }
}

/**
 * Get or initialize the persistent client-side UUIDv7.
 *
 * Checks localStorage first, then cookies, and mints a fresh RFC 9562 UUIDv7 if absent.
 * Persists the resulting ID securely in both localStorage and browser cookies.
 *
 * @returns Persistent user UUIDv7
 */
export function getClientUserId(): string {
  if (typeof localStorage === "undefined") {
    return readCookieUserId() ?? mintClientUuidv7();
  }

  try {
    const stored = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (stored && UUIDV7_PATTERN.test(stored)) {
      writeCookieUserId(stored);
      return stored;
    }
  } catch {
    // LocalStorage access restricted or unavailable
  }

  const cookieId = readCookieUserId();
  const finalId = cookieId ?? mintClientUuidv7();

  persistClientUserId(finalId);
  return finalId;
}

/**
 * Persist the official UUIDv7 to both localStorage and cookie.
 *
 * Called upon successful Google authentication when the server confirms or links the UUIDv7.
 *
 * @param id - User UUIDv7
 */
export function persistClientUserId(id: string): void {
  if (!UUIDV7_PATTERN.test(id)) return;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(USER_ID_STORAGE_KEY, id);
    } catch {
      // Storage quota or policy restriction
    }
  }
  writeCookieUserId(id);
}
