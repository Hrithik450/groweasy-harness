/**
 * Storage seam for the session domain.
 *
 * The domain layer owns query semantics, wire views, and the fail-soft service
 * contract; a backend owns durable bytes. The shipped implementation is the
 * append-only JSONL provider (`./jsonl.backend.ts`), but repositories only see
 * this interface, so tests can substitute an in-memory backend and a future
 * medium never leaks into the domain.
 *
 * @module @openai-harness/session-persistence
 */

import type {
  SessionEvent,
  SessionHeader,
} from "@openai-harness/session";

/** Values written once with a new session. */
export interface PersistedSessionMetadata {
  readonly title: string;
  readonly slug: string | null;
  readonly hidden: boolean;
  /** Non-negative safe integer Unix epoch milliseconds. */
  readonly updatedAt: number;
}

/** Mutable session metadata; omitted fields keep their stored value. */
export interface PersistedSessionMetadataPatch {
  readonly title?: string;
  readonly slug?: string | null;
  readonly hidden?: boolean;
  /** Overrides the backend's clock (tests and replay). */
  readonly updatedAt?: number;
}

/** One stored session without its event body. */
export interface PersistedSession {
  readonly header: SessionHeader;
  readonly title: string;
  readonly slug: string | null;
  readonly hidden: boolean;
  /** Unix epoch milliseconds. */
  readonly createdAt: number;
  /** Unix epoch milliseconds; the latest metadata or event time. */
  readonly updatedAt: number;
  readonly eventCount: number;
}

/** One stored session with its committed event prefix. */
export interface PersistedSessionWithEvents extends PersistedSession {
  readonly events: readonly SessionEvent[];
  readonly nextSeq: number;
}

/**
 * Durable session operations the domain repositories consume.
 *
 * Implementations must validate append contiguity atomically with the write
 * and must make a resolved append durable (or at least visible to subsequent
 * reads on the same instance; the JSONL provider fsyncs).
 */
export interface SessionPersistenceBackend {
  /** Create one session; refuses a duplicate identity. */
  create(
    header: SessionHeader,
    metadata: PersistedSessionMetadata,
  ): Promise<void>;
  /** Read one session plus its events, or `undefined` when absent. */
  read(id: string): Promise<PersistedSessionWithEvents | undefined>;
  /** Observe one session without reading its event body. */
  stat(id: string): Promise<PersistedSession | undefined>;
  /** List every session visible in the backend. */
  list(): Promise<readonly PersistedSession[]>;
  /** Append a contiguous batch. */
  append(id: string, events: readonly SessionEvent[]): Promise<void>;
  /** Append one metadata record; returns the updated session. */
  updateMetadata(
    id: string,
    patch: PersistedSessionMetadataPatch,
  ): Promise<PersistedSession | undefined>;
  /** Delete one session, returning whether it existed. */
  delete(id: string): Promise<boolean>;
  /** Durability barrier. */
  flush(): Promise<void>;
  /** Release backend resources. */
  close(): Promise<void>;
}

/** Backend bound by {@link configureSessionPersistenceBackend}, if any. */
let defaultBackend: SessionPersistenceBackend | undefined;

/**
 * Bind the process-wide backend used by repositories constructed without an
 * explicit one. Host composition calls this once, before the first repository
 * is built.
 * @param backend - the durable session backend.
 */
export function configureSessionPersistenceBackend(
  backend: SessionPersistenceBackend,
): void {
  defaultBackend = backend;
}

/** Resolve the configured default backend or explain why there is none. */
export function requireSessionPersistenceBackend(): SessionPersistenceBackend {
  if (defaultBackend === undefined) {
    throw new Error(
      "Session persistence has no backend: pass one to the repository/store or call configureSessionPersistenceBackend() during host composition.",
    );
  }
  return defaultBackend;
}

/** Clear the bound backend. Intended for isolated tests. */
export function resetSessionPersistenceBackend(): void {
  defaultBackend = undefined;
}
