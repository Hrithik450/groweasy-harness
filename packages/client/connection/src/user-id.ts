/**
 * Identity primitives shared by the Connection transport's two halves.
 *
 * The browser half must not load `node:crypto`, and the node half must not
 * depend on the DOM, so UUIDv7 minting and validation live here and use only
 * `globalThis.crypto` (available in browsers, workers, and Node >= 19).
 *
 * @module @openai-harness/client-connection/user-id
 */

/** Request header carrying the caller's stable anonymous user id. */
export const USER_ID_HEADER = "x-user-id";

/** Query parameter carrying the same id on WebSocket upgrade URLs. */
export const USER_ID_QUERY_PARAM = "userId";

/** Cookie the browser persists the id in, so top-level navigations carry it. */
export const USER_ID_COOKIE_NAME = "oh-user-id";

/** RFC 9562 version 7 UUID with the RFC's `10` variant bits. */
export const UUIDV7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Whether a value is a canonical UUIDv7.
 * @param value - candidate id.
 */
export function isUuidV7(value: unknown): value is string {
  return typeof value === "string" && UUIDV7_PATTERN.test(value);
}

/**
 * Mint an RFC 9562 UUIDv7 without third-party dependencies.
 * @param timestamp - Unix epoch milliseconds (defaults to `Date.now()`).
 */
export function mintUuidv7(timestamp = Date.now()): string {
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
 * Collapse Node's repeated-header array form to one value.
 * @param value - header value as Node exposes it.
 */
export function firstHeaderValue(
  value: string | readonly string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : (value as string | undefined);
}
