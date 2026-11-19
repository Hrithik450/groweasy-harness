import { randomUUID as nodeRandomUUID } from "node:crypto";

/** RFC 4122 v4 id. */
export function randomUUID(): string {
  return nodeRandomUUID();
}

/** Alias kept for older call sites. */
export const uuid = randomUUID;

/**
 * Generates an RFC 9562 UUID v7 with millisecond timestamp ordering.
 * Uses standard modern JavaScript BigInt and Web Crypto.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const timestamp = BigInt(Date.now());
  const view = new DataView(bytes.buffer);

  // 48-bit timestamp in first 6 bytes
  view.setBigUint64(0, (timestamp << 16n) | (view.getBigUint64(0) & 0xffffn));

  // Version 7 (0111 in bits 12-15 of octet 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Variant 1 (10xx in bits 6-7 of octet 8)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
