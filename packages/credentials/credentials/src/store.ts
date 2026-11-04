/**
 * Host-owned storage bindings for durable credential records.
 *
 * The table, the transaction boundary, and any cross-process lock belong to the
 * host. The record service receives them instead of importing a database
 * client, which keeps this package free of application aliases and framework
 * imports while the record semantics stay in one place.
 *
 * @module @openai-harness/credentials
 */

import type {
  CredentialKey,
  CredentialRecord,
  CredentialRecordEntry,
} from "./types";

/**
 * The four operations a durable record store must answer.
 *
 * A store that cannot promise cross-process exclusion should say so by
 * leaving {@link writable} unset rather than by silently accepting concurrent
 * read-modify-write cycles; {@link CredentialRecords.modifyRecord} serializes
 * callers inside one process, and durable rotation of a shared token needs the
 * backing store's own lock.
 */
export interface CredentialStore {
  /**
   * Read one stored record exactly as its owner wrote it.
   *
   * @param key - the record to read.
   * @returns the record, or undefined while none is stored.
   */
  read(key: CredentialKey): Promise<CredentialRecord | undefined>;
  /**
   * Write one record, replacing any record already stored under the key.
   *
   * @param key - the record's address.
   * @param record - the owner's payload.
   */
  write(key: CredentialKey, record: CredentialRecord): Promise<void>;
  /**
   * Remove one record; removing an absent record is a no-op.
   *
   * @param key - the record to remove.
   */
  delete(key: CredentialKey): Promise<void>;
  /**
   * Enumerate every stored record's address and tag, values excluded.
   *
   * @returns every stored record.
   */
  list(): Promise<readonly CredentialRecordEntry[]>;
  /**
   * Whether this store currently accepts writes. Omitted means writable.
   */
  readonly writable?: boolean;
}
