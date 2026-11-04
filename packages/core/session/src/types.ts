/**
 * Durable Session identity, header, and event-position types.
 *
 * A brand makes structurally identical strings or numbers non-interchangeable
 * at the type level: a SessionId cannot be passed where a ToolCallId is
 * expected, and an event sequence cannot be passed as a log offset. Comparison,
 * logging, and serialization retain the underlying primitive behavior.
 *
 * @module @openai-harness/session
 */

import {
  brandString,
  brandNumber,
  type Branded,
  type BrandedNumber,
} from "@openai-harness/brand";

/** Identifies one session in the store (and its persistence artifacts). */
export type SessionId = Branded<"SessionId">;

/**
 * Brand a string as a {@link SessionId}.
 * @param id - the raw session id string.
 * @returns the same string with the session-id brand.
 */
export function SessionId(id: string): SessionId {
  return brandString<SessionId>(id);
}

/** Sequence number of one existing event in a Session log. */
export type SessionSeq = BrandedNumber<"SessionSeq">;

/**
 * Admit a numeric value as an existing Session event position.
 * @param value - non-negative safe integer admitted by the owning log operation.
 * @returns the same number with the Session-sequence brand.
 */
export function SessionSeq(value: number): SessionSeq {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError(
      `SessionSeq must be a non-negative safe integer, got ${String(value)}`,
    );
  }
  return brandNumber<SessionSeq>(value);
}

/** A Session log gap, prefix length, or read offset, which may equal the event count. */
export type SessionLogOffset = BrandedNumber<"SessionLogOffset">;

/**
 * Admit a numeric value as a Session log offset.
 * @param value - non-negative safe integer used as a gap or prefix length.
 * @returns the same number with the Session-log-offset brand.
 */
export function SessionLogOffset(value: number): SessionLogOffset {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError(
      `SessionLogOffset must be a non-negative safe integer, got ${String(value)}`,
    );
  }
  return brandNumber<SessionLogOffset>(value);
}

/** Inclusive Session event watermark, or `-1` before any event exists. */
export type SessionSeqCursor = SessionSeq | -1;

/** One existing Session event position, or explicit absence. */
export type OptionalSessionSeq = SessionSeq | null;

/**
 * Current logical Session format version, stamped into every newly written
 * {@link SessionHeader}. Bump when an existing discriminator cannot prevent
 * unsafe interpretation; a structural difference alone is insufficient.
 */
export const SESSION_FORMAT_VERSION = 1;

/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
export interface SessionHeader {
  readonly version: typeof SESSION_FORMAT_VERSION;
  /** The session's id (mirrors the Session's id). */
  readonly id: SessionId;
  /** Owning authenticated user (product extension for multi-tenant web auth). */
  readonly userId?: string;
  /** Non-negative safe integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number;
  /**
   * Id of the agent preset this session's agent was composed from, when the
   * deployment composes per session.
   */
  readonly agentPreset?: string;
}

export interface CreateSessionHeaderInput {
  id?: SessionId;
  userId?: string;
  createdAt?: number;
  agentPreset?: string;
}

/**
 * High-speed session observation returned for sidebar listing and stat queries.
 * Combines the immutable genesis header with folded projections (title, updatedAt, eventCount).
 */
export interface SessionPersistenceSnapshot {
  /** Detached immutable genesis header */
  readonly header: SessionHeader;
  /** Folded title derived from the title projection / events */
  readonly title: string;
  /** Non-negative safe integer Unix epoch milliseconds of the latest event */
  readonly updatedAt: number;
  /** Total count of events currently committed in the ledger */
  readonly eventCount: number;
  /** Whether this session is hidden from default listings */
  readonly hidden?: boolean;
}
