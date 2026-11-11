/**
 * UUID v4 minting for the browser client.
 *
 * Uses the platform generator when the context exposes one, and falls back to
 * `crypto.getRandomValues` for insecure-context pages that lack
 * `crypto.randomUUID`.
 *
 * @module @openai-harness/client-ui-session/internal/uuid
 */

/** Random v4 UUID (RFC 9562 §5.4). */
export function randomUUID(): string {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  // Version 4 in the high nibble of byte 6, variant 10 in byte 8.
  const hex = Array.from(bytes, (byte, index) => {
    const pinned =
      index === 6 ? (byte & 0x0f) | 0x40 : index === 8 ? (byte & 0x3f) | 0x80 : byte;
    return pinned.toString(16).padStart(2, "0");
  }).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
