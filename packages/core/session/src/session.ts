/**
 * In-memory Session representation with append-only event log and persistence dispatch.
 *
 * Persistence stays a host concern: the application binds its append-only
 * ledger through {@link configureSessionPersistence}, mirroring the host-binding
 * seams used by `@openai-harness/compaction-basic` and
 * `@openai-harness/agent-loop`. This package therefore imports no database
 * module or application alias.
 *
 * @module @openai-harness/session
 */

import { SessionSeq, type SessionHeader, type SessionId } from "./types";
import type { SessionEvent, SessionEventMap, SessionEventType } from "./events";
import { interruptedTurnClosers } from "./repair";

/**
 * Host-owned append-only ledger operations used by {@link Session}.
 *
 * Structurally satisfied by `SessionEventsRepository` in
 * `@openai-harness/session-persistence`; the host binds its instance once with
 * {@link configureSessionPersistence}.
 */
export interface SessionPersistence {
  /**
   * Read committed events for one session in sequence order.
   * @param sessionId - the owning session.
   * @param options - optional read window.
   * @returns the committed events, in strict sequence order.
   */
  getEvents(
    sessionId: SessionId | string,
    options?: { fromSeq?: number; limit?: number },
  ): Promise<readonly SessionEvent[]>;

  /**
   * Append a contiguous batch atomically.
   * @param sessionId - the owning session.
   * @param events - events to persist, in sequence order.
   */
  appendBatch(
    sessionId: SessionId | string,
    events: readonly SessionEvent[],
  ): Promise<unknown>;
}

/** Ledger bound by {@link configureSessionPersistence}, if any. */
let configuredPersistence: SessionPersistence | undefined;

/**
 * Bind the host application's event ledger as the default persistence port.
 * @param persistence - the host's append-only ledger.
 */
export function configureSessionPersistence(
  persistence: SessionPersistence,
): void {
  configuredPersistence = persistence;
}

/**
 * Clear the installed persistence port. Intended for tests that need an
 * isolated host.
 */
export function resetSessionPersistence(): void {
  configuredPersistence = undefined;
}

/** Resolve the configured ledger or explain why there is none. */
function requirePersistence(): SessionPersistence {
  if (!configuredPersistence) {
    throw new Error(
      "Session has no persistence: call configureSessionPersistence() during host composition.",
    );
  }
  return configuredPersistence;
}

export type SessionEventListener = (
  event: SessionEvent,
) => void | Promise<void>;

export class Session {
  readonly header: SessionHeader;
  private _log: SessionEvent[] = [];
  private readonly _listeners = new Set<SessionEventListener>();
  private _unpersisted: SessionEvent[] = [];
  private _lastPersist: Promise<void> = Promise.resolve();

  constructor(
    header: SessionHeader,
    initialEvents: readonly SessionEvent[] = [],
  ) {
    this.header = header;
    this._log = [...initialEvents];
  }

  get id(): SessionId {
    return this.header.id;
  }

  get userId(): string | undefined {
    return this.header.userId;
  }

  get seq(): SessionSeq {
    return SessionSeq(this._log.length);
  }

  get events(): readonly SessionEvent[] {
    return this._log;
  }

  /**
   * Resolves once the most recent append is durably committed (or has failed).
   *
   * `append` returns synchronously, so a caller that must act on a durable
   * position — the detail-bar checkpoint in particular — awaits this between
   * the append and that action.
   */
  whenPersisted(): Promise<void> {
    return this._lastPersist;
  }

  /**
   * Registers a listener for live append events.
   */
  onEvent(listener: SessionEventListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Appends an event to the session log, dispatches to live listeners,
   * and persists immediately to ensure durable monotonicity.
   */
  append<K extends SessionEventType>(
    type: K,
    data: SessionEventMap[K],
    opts?: {
      surfaceOp?: "append" | "replace";
      sourceEventSeqs?: SessionSeq[];
    },
  ): SessionEvent<K> {
    const persistence = requirePersistence();
    const nextSeq = this.seq;
    const event = {
      type,
      seq: nextSeq,
      time: Date.now(),
      data,
      ...opts,
    } as SessionEvent<K>;

    this._log.push(event as unknown as SessionEvent);

    // The ledger rejects a non-contiguous batch asynchronously, so this must
    // be a rejection handler, not a `try`: an unawaited rejection would take
    // the whole process down instead of failing one append.
    this._lastPersist = Promise.resolve(
      persistence.appendBatch(this.id, [event as unknown as SessionEvent]),
    ).then(
      () => undefined,
      (err: unknown) => {
        console.error(
          `[Session ${this.id}] Failed to persist event seq ${nextSeq}:`,
          err,
        );
      },
    );

    for (const listener of this._listeners) {
      try {
        void listener(event as unknown as SessionEvent);
      } catch (listenerErr) {
        console.error(
          `[Session ${this.id}] Observer failed for event seq ${nextSeq}:`,
          listenerErr,
        );
      }
    }

    return event;
  }

  /**
   * Loads a Session instance from persistence given its ID and header.
   *
   * Repairs an interrupted tail turn before returning: any synthetic closers
   * are appended durably, then included in the returned Session's log.
   */
  static async load(header: SessionHeader): Promise<Session> {
    const persistence = requirePersistence();
    const events = await persistence.getEvents(header.id);
    const closers = interruptedTurnClosers(events);
    if (closers.length > 0) {
      await persistence.appendBatch(header.id, closers);
      return new Session(header, [...events, ...closers]);
    }
    return new Session(header, events);
  }
}
