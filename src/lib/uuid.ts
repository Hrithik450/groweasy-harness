export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Encode 48-bit timestamp using DataView to avoid BigInt
  const ms = Date.now();
  const view = new DataView(bytes.buffer);

  // High 16 bits of ms → bytes[0..1]
  view.setUint16(0, (ms / 0x100000000) >>> 0, false);
  // Low 32 bits of ms → bytes[2..5]
  view.setUint32(2, ms >>> 0, false);

  // Version 7 (bits 12-15 of byte 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Variant 10xx (bits 6-7 of byte 8)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const h = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
