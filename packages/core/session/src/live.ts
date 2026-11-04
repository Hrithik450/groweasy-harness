/**
 * The process's live session instances, keyed by session id.
 *
 * A session has exactly one writer for its event log: the in-memory log
 * assigns sequence numbers, so anything that appends behind its back stamps a
 * stale `seq` and the ledger rejects the next append as non-contiguous. Tools
 * and RPC handlers that mutate a session from the outside (the detail-bar
 * writer in particular) look the running instance up here and append through
 * it instead of the ledger directly.
 *
 * Registration is scoped to a turn: the workflow claims the session it loaded
 * and releases it in `finally`, so an idle session has no entry and the direct
 * ledger path stays correct. The per-session turn lock means two turns cannot
 * hold the same id at once.
 *
 * The interface is structural so the workflow layer (which drives its own
 * `AgentSession` view) can claim without importing the concrete class.
 *
 * @module @openai-harness/session
 */

import type { SessionEventMap, SessionEventType, SessionEvent } from "./events";
import type { SessionId, SessionSeq } from "./types";

/** The live-session surface the registry hands back to outside writers. */
export interface LiveSession {
  readonly id: SessionId;
  append<K extends SessionEventType>(
    type: K,
    data: SessionEventMap[K],
    opts?: {
      surfaceOp?: "append" | "replace";
      sourceEventSeqs?: SessionSeq[];
    },
  ): SessionEvent<K>;
  /**
   * Resolves once the most recent append is durable. Present on the concrete
   * `Session`; a structural implementation may omit it.
   */
  whenPersisted?(): Promise<void>;
}

const liveSessions = new Map<string, LiveSession>();

/**
 * Register a running session as the owner of its id.
 * @param session - the session a turn is running on.
 * @returns idempotent release; it only removes this session, never a newer one.
 */
export function claimLiveSession(session: LiveSession): () => void {
  const id = String(session.id);
  liveSessions.set(id, session);
  return () => {
    if (liveSessions.get(id) === session) liveSessions.delete(id);
  };
}

/**
 * The session instance currently running on this id, if any.
 * @param sessionId - the id to look up.
 */
export function getLiveSession(
  sessionId: SessionId | string,
): LiveSession | undefined {
  return liveSessions.get(String(sessionId));
}
