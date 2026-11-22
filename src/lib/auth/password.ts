import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Salted scrypt hash: `salt:derived-hex`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");

  return (
    expected.length === derived.length && timingSafeEqual(expected, derived)
  );
}
