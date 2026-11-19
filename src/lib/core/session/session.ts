/**
 * In-memory Session representation with append-only event log and persistence dispatch.
 *
 * @module @/lib/core/session/session
 */

import { randomUUID } from "@/lib/utils/uuid";
import { MessageId } from "@/lib/llm/llm/brand";
import { SessionSeq, type SessionHeader, type SessionId } from "./types";
import type { SessionEvent, SessionEventMap, SessionEventType } from "./events";
import { sessionEventsRepo } from "@/lib/session/persistence/events.repo";
import {
  appendToSessionLog,
  readSessionLog,
  rememberSessionLog,
} from "@/lib/session/log.cache";
import {
  danglingToolResultClosers,
  interruptedTurnClosers,
} from "./repair";

export type SessionEventListener = (
  event: SessionEvent,
) => void | Promise<void>;

export class Session {
  readonly header: SessionHeader;
  private _log: SessionEvent[] = [];
  private readonly _listeners = new Set<SessionEventListener>();
  private _unpersisted: SessionEvent[] = [];

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
      id?: MessageId;
      surfaceOp?: "append" | "replace";
      sourceEventSeqs?: SessionSeq[];
    },
  ): SessionEvent<K> {
    const nextSeq = this.seq;
    const now = Date.now();
    const event = {
      id: opts?.id ?? MessageId(randomUUID()),
      sessionId: this.id,
      seq: nextSeq,
      time: now,
      type,
      data,
      createdAt: new Date(now).toISOString(),
    } as unknown as SessionEvent<K>;

    this._log.push(event as unknown as SessionEvent);
    // Keep the hot copy exact rather than dropping it: the next prompt reads it.
    appendToSessionLog(this.id, event as unknown as SessionEvent);

    try {
      void sessionEventsRepo.appendBatch(this.id, [
        event as unknown as SessionEvent,
      ]);
    } catch (err) {
      console.error(
        `[Session ${this.id}] Failed to persist event seq ${nextSeq}:`,
        err,
      );
    }

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
  static async load(
    header: SessionHeader,
    prefetched?: readonly SessionEvent[],
  ): Promise<Session> {
    const events = prefetched ?? (await readSessionLog(header.id));
    // Unanswered calls first, then the open step and turn they belonged to.
    const dangling = danglingToolResultClosers(events);
    const closers = [
      ...dangling,
      ...interruptedTurnClosers([...events, ...dangling]),
    ];
    if (closers.length > 0) {
      await sessionEventsRepo.appendBatch(header.id, closers);
      const merged = [...events, ...closers];
      rememberSessionLog(header.id, merged);
      return new Session(header, merged);
    }
    return new Session(header, events);
  }
}
