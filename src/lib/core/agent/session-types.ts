/**
 * Session vocabulary the agent loop reads.
 *
 * The loop never owns storage: it appends typed events and replays them. The
 * event map, header, and identity brands are owned by the session core so the
 * host's `Session` satisfies `AgentSession` without an adapter; this module is
 * the loop's stable import surface for them.
 *
 * @module @/lib/core/agent/session-types
 */

export type {
  SessionEvent,
  SessionEventMap,
  SessionEventType,
  TurnEndReason,
} from "@/lib/core/session/events";
export type { SessionHeader } from "@/lib/core/session/types";
export type { SessionId, SessionSeq } from "@/lib/core/session/types";
