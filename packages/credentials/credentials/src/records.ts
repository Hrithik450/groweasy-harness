/**
 * Durable credential records over a host-bound {@link CredentialStore}.
 *
 * The records half answers one question: "what credential does this owner hold
 * for this id". Nothing can layer here — a grant has no environment to be read
 * from — so presence of the record is the whole fact, and
 * {@link CredentialRecords.modifyRecord} is the only write path because a
 * correct write depends on the current value (a token refresh is
 * read-decide-replace).
 *
 * The store is supplied by the host: passed to the constructor, or bound once
 * through {@link configureCredentialStore} during host composition, the same
 * way `@openai-harness/session-persistence` binds its event store.
 *
 * @module @openai-harness/credentials
 */

import type {
  CredentialKey,
  CredentialRecord,
  CredentialRecordEntry,
  CredentialRecordInfo,
} from "./types";
import type { CredentialStore } from "./store";

/** Store bound by {@link configureCredentialStore}, if any. */
let defaultStore: CredentialStore | undefined;

/**
 * Bind the host application's storage as the default store for record
 * services constructed without an explicit one. Host composition calls this
 * once, before the first service is built.
 *
 * @param store - the host's credential-record storage.
 */
export function configureCredentialStore(store: CredentialStore): void {
  defaultStore = store;
}

/**
 * Resolves the configured default store or explains why there is none.
 */
function requireDefaultStore(): CredentialStore {
  if (defaultStore === undefined) {
    throw new Error(
      "CredentialRecords has no store: pass one to the constructor or call configureCredentialStore() during host composition.",
    );
  }
  return defaultStore;
}

/**
 * The record half of the credential seam.
 *
 * Every write is serialized per key inside this process, so two rotations of
 * one token cannot lose whichever read first. Exclusion across processes is
 * the backing store's job; see {@link CredentialStore}.
 */
export class CredentialRecords {
  /** Tail of the per-key write chain; reads never wait on it. */
  private readonly pending = new Map<CredentialKey, Promise<unknown>>();

  /**
   * @param store - host storage bindings; defaults to the store bound by
   *   {@link configureCredentialStore}.
   */
  constructor(private readonly store: CredentialStore = requireDefaultStore()) {}

  /**
   * Read one stored record. The value is returned as its owner wrote it; a
   * grant payload is not interpreted on the way out.
   *
   * @param key - the record to read.
   * @returns the record, or undefined while none is stored.
   */
  async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return this.store.read(key);
  }

  /**
   * Describe one record for configuration surfaces without exposing its value.
   *
   * @param key - the record to describe.
   * @returns presence, discriminant, and writability.
   */
  async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const record = await this.store.read(key);
    return {
      configured: record !== undefined,
      kind: record?.kind,
      writable: this.store.writable ?? true,
    };
  }

  /**
   * Enumerate every stored record's address and tag. Records have no ambient
   * discovery path, so a surface that cannot list them cannot show what a user
   * is authorized for, nor find an orphan left by an uninstalled owner.
   *
   * @returns every stored record, values excluded.
   */
  async listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return this.store.list();
  }

  /**
   * Serialized read-modify-write over one record — the only write path.
   *
   * `mutate` sees the record as it stands at the moment the write is exclusive,
   * and returning `undefined` leaves the entry untouched.
   *
   * @param key - the record to modify.
   * @param mutate - receives the current record and returns its replacement, or `undefined` to leave it.
   * @returns the record after the write, or the current one when `mutate` declined.
   */
  async modifyRecord(
    key: CredentialKey,
    mutate: (
      current: CredentialRecord | undefined,
    ) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    return this.enqueue(key, async () => {
      const current = await this.store.read(key);
      const next = await mutate(current);
      if (next !== undefined) await this.store.write(key, next);
      return next ?? current;
    });
  }

  /**
   * Remove one record; removing an absent record is a no-op. Queued behind any
   * write already running for the same key.
   *
   * @param key - the record to remove.
   */
  async deleteRecord(key: CredentialKey): Promise<void> {
    await this.enqueue(key, async () => {
      await this.store.delete(key);
    });
  }

  /**
   * Run `task` after every earlier write for the same key has settled. A
   * rejected predecessor never blocks its successor: the chain carries the
   * ordering, not the outcome.
   *
   * @param key - the record whose write chain to join.
   * @param task - the exclusive operation.
   * @returns the task's result.
   */
  private enqueue<T>(key: CredentialKey, task: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    this.pending.set(key, run);
    return run.finally(() => {
      if (this.pending.get(key) === run) this.pending.delete(key);
    });
  }
}
