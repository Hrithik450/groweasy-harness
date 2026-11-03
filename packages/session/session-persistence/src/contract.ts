/**
 * Persistence contract and validation guards.
 * Strictly enforces fail-closed invariants and monotonic sequence ordering.
 *
 * @module @openai-harness/session-persistence
 */

import { SESSION_FORMAT_VERSION } from "@openai-harness/session";
import type { SessionEvent, SessionId } from "@openai-harness/session";

export class SessionPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionPersistenceError";
  }
}

export class SessionContiguityError extends SessionPersistenceError {
  constructor(
    sessionId: string,
    expectedSeq: number,
    actualSeq: number,
    index: number,
  ) {
    super(
      `Append seq mismatch for session "${sessionId}": expected ${expectedSeq} at batch index ${index}, got ${actualSeq}`,
    );
    this.name = "SessionContiguityError";
  }
}

/**
 * Enforces that an incoming event batch contiguously continues the session log without gaps.
 * Every event sequence must strictly equal cursor + index.
 */
export function assertContiguous(
  sessionId: SessionId | string,
  events: readonly SessionEvent[],
  cursor: number,
): void {
  for (const [index, event] of events.entries()) {
    const expected = cursor + index;
    if (event.seq !== expected) {
      throw new SessionContiguityError(sessionId, expected, event.seq, index);
    }
  }
}

/**
 * Validates that the session header format version matches the current harness format version.
 */
export function assertVersion(header: { version: number; id: string }): void {
  if (header.version !== SESSION_FORMAT_VERSION) {
    throw new SessionPersistenceError(
      `Session "${header.id}" has format version ${header.version}, but current version is ${SESSION_FORMAT_VERSION}.`,
    );
  }
}
