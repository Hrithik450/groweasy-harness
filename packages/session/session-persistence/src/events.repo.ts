/**
 * Append-only event ledger over the session persistence seam.
 *
 * Guarantees:
 * - strictly monotonic sequence numbering per session;
 * - dense, contiguous batches (zero gaps) validated inside the backend write;
 * - post-commit publication only.
 *
 * The ledger is storage-neutral: the host supplies a
 * {@link SessionPersistenceBackend} and an optional publisher through a
 * {@link SessionEventsStore}. A host that composes the backend once can bind
 * that store with {@link configureSessionEventsStore} and construct the
 * repository without arguments.
 *
 * @module @openai-harness/session-persistence
 */

import type {
  SessionEvent,
  SessionId,
} from "@openai-harness/session";
import { assertContiguous } from "./contract";
import type { SessionPersistenceBackend } from "./backend";
import {
  resolveSessionEventsBackend,
  requireDefaultStore,
  type SessionEventsStore,
} from "./store";

/**
 * Per-backend, per-session append queues.
 *
 * Reading the cursor and appending must be one serialized step. The old ledger
 * got that from a synchronous SQL transaction; a file backend awaits I/O, so
 * without this queue two fire-and-forget appends from `Session.append` could
 * both observe the same cursor. The queue is shared across repository
 * instances so every writer in the process sees the same order.
 */
const appendQueues = new WeakMap<
  SessionPersistenceBackend,
  Map<string, Promise<void>>
>();

export class SessionEventsRepository {
  private readonly storeOverride: SessionEventsStore | undefined;
  private readonly backendInstance: SessionPersistenceBackend | undefined;

  /**
   * @param store - host storage bindings; defaults to the store bound by
   *   {@link configureSessionEventsStore}. Resolution is deferred to first use
   *   so a process-wide instance can be constructed before composition.
   */
  constructor(store?: SessionEventsStore) {
    this.storeOverride = store;
    this.backendInstance = store?.backend;
  }

  /** The host store, resolved lazily against the process-wide binding. */
  private get store(): SessionEventsStore {
    return this.storeOverride ?? requireDefaultStore();
  }

  private get backend(): SessionPersistenceBackend {
    return this.backendInstance ?? resolveSessionEventsBackend(this.store);
  }

  /** Serialize one cursor-read + append + publish step per session. */
  private enqueue<T>(id: string, job: () => Promise<T>): Promise<T> {
    let queues = appendQueues.get(this.backend);
    if (queues === undefined) {
      queues = new Map();
      appendQueues.set(this.backend, queues);
    }
    const previous = queues.get(id) ?? Promise.resolve();
    const run = previous.then(job, job);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    queues.set(id, settled);
    void settled.then(() => {
      if (queues?.get(id) === settled) queues.delete(id);
    });
    return run;
  }

  /**
   * Retrieve the current next-sequence number for a session (0 if empty).
   * @param sessionId - the session whose cursor is read.
   */
  async getNextSeq(sessionId: SessionId | string): Promise<number> {
    const snapshot = await this.backend.stat(String(sessionId));
    return snapshot?.eventCount ?? 0;
  }

  /**
   * Append a contiguous batch to the session log and then announce it.
   * @param sessionId - the owning session.
   * @param events - events in sequence order.
   */
  async appendBatch(
    sessionId: SessionId | string,
    events: readonly SessionEvent[],
  ): Promise<void> {
    if (events.length === 0) return;

    const key = String(sessionId);
    return this.enqueue(key, async () => {
      const cursor = await this.getNextSeq(key);
      assertContiguous(key, events, cursor);
      await this.backend.append(key, events);

      // Only after the durable append resolved: subscribers may safely replay
      // from the backend and then apply this batch.
      this.store.publish?.(key, events);
    });
  }

  /**
   * Append one event to the session log.
   * @param sessionId - the owning session.
   * @param event - the event to append.
   */
  async append(
    sessionId: SessionId | string,
    event: SessionEvent,
  ): Promise<void> {
    await this.appendBatch(sessionId, [event]);
  }

  /**
   * Read all or a slice of committed events in strict sequence order.
   * @param sessionId - the owning session.
   * @param options - optional `fromSeq` and `limit` window.
   */
  async getEvents(
    sessionId: SessionId | string,
    options?: { fromSeq?: number; limit?: number },
  ): Promise<SessionEvent[]> {
    const record = await this.backend.read(String(sessionId));
    let events = [...(record?.events ?? [])];

    if (options?.fromSeq !== undefined) {
      const fromSeq = options.fromSeq;
      events = events.filter((event) => event.seq >= fromSeq);
    }
    if (options?.limit !== undefined && options.limit > 0) {
      events = events.slice(0, options.limit);
    }
    return events;
  }

  /**
   * Return the total number of committed events for this session.
   * @param sessionId - the owning session.
   */
  async countEvents(sessionId: SessionId | string): Promise<number> {
    const snapshot = await this.backend.stat(String(sessionId));
    return snapshot?.eventCount ?? 0;
  }
}

/**
 * Process-wide ledger repository.
 *
 * Resolves the host bindings lazily, so importing it before composition is
 * safe; the first call must follow {@link configureSessionEventsStore} and the
 * backend binding.
 */
export const sessionEventsRepo = new SessionEventsRepository();
