/**
 * Client-safe vocabulary of the credential seam: the key brands, the stored
 * record union, the value-free views a configuration surface may read, and the
 * session-user shape the token carries.
 *
 * Types only. Nothing here reaches an application alias, a framework import,
 * or a database symbol, so the app and the gateway compile against the same
 * signatures.
 *
 * @module @openai-harness/credentials/types
 */

import type { Branded } from "@openai-harness/brand";

/**
 * Nominal address of one stored credential record: `<scope>/<id>`, where
 * `scope` is the registered name of the owner and `id` is that owner's own
 * addressing unit (a connector uses its provider slug).
 *
 * The scope is the owner rather than the domain because a record's payload is
 * written in its owner's format: two owners serving the same provider would
 * otherwise read each other's payload.
 */
export type CredentialKey = Branded<"CredentialKey">;

/**
 * A credential the harness itself understands: an API key, provider
 * environment values, or both. A record carrying neither states that its owner
 * confirmed ambient authentication, which is a different fact from having no
 * record at all.
 */
export interface ApiKeyRecord {
  /** Discriminant. */
  readonly kind: "api-key";
  /** The non-empty secret value, when this credential is a key at all. */
  readonly key?: string;
  /** Provider environment values such as `AWS_PROFILE`; names are POSIX identifiers. */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * The product of one authorization grant, kept verbatim for its owner. The
 * seam never reads, validates, or reshapes {@link payload}: it is written in
 * the owner's format and only that owner can interpret it. The single
 * constraint is that it survives a JSON round trip.
 */
export interface GrantRecord {
  /** Discriminant. */
  readonly kind: "grant";
  /** Owner-defined JSON value; opaque to the seam and to every other owner. */
  readonly payload: unknown;
}

/** One durable credential record, tagged by what the seam may do with it. */
export type CredentialRecord = ApiKeyRecord | GrantRecord;

/**
 * Presence and writability facts for one record, safe for configuration UIs —
 * never the value. The view has no slot a value could ride in.
 */
export interface CredentialRecordInfo {
  /** Whether a record is stored. */
  configured: boolean;
  /** Discriminant of the stored record; absent while none is stored. */
  kind?: CredentialRecord["kind"];
  /** Whether the active store would currently accept a write. */
  writable: boolean;
}

/** One stored record's address and tag, for enumeration — never its value. */
export interface CredentialRecordEntry {
  /** The record's address. */
  key: CredentialKey;
  /** Discriminant of the stored record. */
  kind: CredentialRecord["kind"];
}

/**
 * The user facts an auth-session token carries.
 *
 * Deliberately structural rather than the host's `User` row: the package signs
 * and verifies whatever the host certifies, and the host decides which row
 * columns exist. The application's `User` is assignable to this shape, so the
 * shim accepts it unchanged.
 */
export interface AuthSessionUser {
  /** Stable user id the session belongs to. */
  id: string;
  /** Google subject id once the account is linked. */
  googleId?: string | null;
  /** Confirmed email address, when the provider supplies one. */
  email?: string | null;
  /** Display name. */
  name?: string | null;
  /** Avatar URL. */
  picture?: string | null;
  /** Whether the provider verified the email address. */
  emailVerified?: boolean | null;
  /** Row creation timestamp, in ISO form. */
  createdAt?: string;
  /** Row update timestamp, in ISO form. */
  updatedAt?: string;
}
