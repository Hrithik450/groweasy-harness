/**
 * Constructors and readers for {@link CredentialKey}.
 *
 * A key is `<scope>/<id>`, both segments lowercase hyphenated identifiers. The
 * `/` is what keeps this grammar disjoint from a POSIX environment-variable
 * name, so a record address can never be mistaken for a reference.
 *
 * @module @openai-harness/credentials/keys
 */

import { brandString } from "@openai-harness/brand";
import type { CredentialKey } from "./types";

/** One segment of a key: a lowercase hyphenated identifier. */
const KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Whether a raw string could be a {@link CredentialKey} segment at all.
 * Consumers whose addressing units come from somewhere else — a settings dict
 * key, a library's own provider id — ask this before building a key, because a
 * unit outside the grammar can never have stored a record and should read as
 * "nothing stored" rather than as a thrown error.
 *
 * @param value - candidate segment.
 * @returns true when {@link credentialKey} would accept it as either segment.
 */
export function isCredentialKeySegment(value: string): boolean {
  return KEY_SEGMENT_PATTERN.test(value);
}

/**
 * Brand a scope and an id as a {@link CredentialKey}.
 *
 * @param scope - the owning package's registered name, such as `connectors`.
 * @param id - that owner's own addressing unit, such as a provider slug.
 * @returns the branded key.
 * @throws TypeError when either segment is not a lowercase hyphenated identifier.
 */
export function credentialKey(scope: string, id: string): CredentialKey {
  for (const segment of [scope, id]) {
    if (!KEY_SEGMENT_PATTERN.test(segment)) {
      throw new TypeError(
        `credential key segment "${segment}" must match ${String(KEY_SEGMENT_PATTERN)}`,
      );
    }
  }
  return brandString<CredentialKey>(`${scope}/${id}`);
}

/**
 * Brand a stored `<scope>/<id>` string as a {@link CredentialKey}. This is the
 * read half of {@link credentialKey}, for a store admitting keys off disk.
 *
 * @param value - candidate key in its joined form.
 * @returns the branded key.
 * @throws TypeError when the value is not exactly two valid segments.
 */
export function parseCredentialKey(value: string): CredentialKey {
  const segments = value.split("/");
  const [scope, id] = segments;
  if (segments.length !== 2 || scope === undefined || id === undefined) {
    throw new TypeError(`credential key "${value}" must be "<scope>/<id>"`);
  }
  return credentialKey(scope, id);
}

/**
 * The owning package's name for one key. A record whose scope names no
 * currently registered owner is an orphan, which a configuration surface must
 * report as such rather than as a working credential.
 *
 * @param key - the key to read.
 * @returns the scope segment.
 */
export function credentialKeyScope(key: CredentialKey): string {
  // Both constructors validate two segments, so the split cannot come back
  // short here.
  return key.slice(0, key.indexOf("/"));
}

/**
 * The owner's own addressing unit for one key — the half the owner chose.
 *
 * @param key - the key to read.
 * @returns the id segment.
 */
export function credentialKeyId(key: CredentialKey): string {
  return key.slice(key.indexOf("/") + 1);
}
