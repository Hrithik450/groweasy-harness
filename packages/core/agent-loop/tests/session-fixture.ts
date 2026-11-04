/**
 * Minimal in-memory session for loop tests.
 *
 * Persistence, loading, and repair stay in the host application; these tests
 * only need the append-only surface the loop depends on.
 */

import {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionSeq,
  type SessionEvent,
  type SessionEventMap,
  type SessionEventType,
  type SessionHeader,
} from "@openai-harness/session";
import type { AgentSession } from "../src/agent-types";

export class RecordingSession implements AgentSession {
  private readonly _log: SessionEvent[] = [];

  constructor(readonly header: SessionHeader) {}

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

  append<K extends SessionEventType>(
    type: K,
    data: SessionEventMap[K],
    _opts?: {
      surfaceOp?: "append" | "replace";
      sourceEventSeqs?: SessionSeq[];
    },
  ): SessionEvent<K> {
    const event = {
      type,
      seq: this.seq,
      time: 0,
      data,
    } as unknown as SessionEvent<K>;
    this._log.push(event as unknown as SessionEvent);
    return event;
  }
}

/** Header for a test session with a stable id. */
export function testHeader(id: string): SessionHeader {
  return { version: SESSION_FORMAT_VERSION, id: SessionId(id), createdAt: 0 };
}
