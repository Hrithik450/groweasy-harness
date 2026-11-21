/**
 * Storage → agent boundary.
 *
 * The agent layer knows a session by its header and a turn by its composition;
 * it never sees a database row. This adapter turns one into the other, so the
 * registry stays free of schema types.
 *
 * @module @/lib/session/agent.host
 */

import { composeInstructions } from "@/lib/core/agent/compose.turn";
import { ensureAgent, hasAgent, type AgentSeed } from "@/lib/core/agent/registry";
import { getSessionById } from "@/lib/repositories/sessions.repo";
import { getToolDefinitionsForSlug } from "@/lib/tools";
import { Session } from "@/lib/core/session/session";
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  type SessionHeader,
} from "@/lib/core/session/types";
import type { Session as SessionRow } from "@/lib/db";

/** Fields a header needs; a `SessionView` carries exactly these. */
type SessionIdentity = Pick<SessionRow, "id" | "userId" | "createdAt">;

/** Durable identity of a stored session, in agent terms. */
export function sessionHeaderFrom(row: SessionIdentity): SessionHeader {
  const createdAt = Date.parse(row.createdAt);
  return {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(row.id),
    ...(row.userId ? { userId: row.userId } : {}),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}

/** Instructions and tools one stored session composes into. */
export function sessionSeedFrom(row: SessionRow): AgentSeed {
  return {
    header: sessionHeaderFrom(row),
    // Skill versions change under a warm agent; resolve the prompt per step
    // so a reload clears the notice and a new deploy is seen immediately.
    resolveInstructions: () =>
      composeInstructions(getSessionById(row.id) ?? row),
    tools: getToolDefinitionsForSlug(row.slug),
  };
}

/** Warm the agent that serves this stored session. */
export function ensureAgentForSession(row: SessionRow) {
  return ensureAgent(sessionSeedFrom(row));
}

/**
 * Repair an interrupted tail without warming an agent.
 *
 * Opening a persisted session must close dangling calls and open turns so a
 * crashed run stops reading as "running". A live agent owns its own log, so it
 * is left alone; this is the server's `resume`, never part of observing.
 */
export async function repairSessionTail(row: SessionIdentity): Promise<void> {
  if (hasAgent(String(row.id))) return;
  await Session.load(sessionHeaderFrom(row));
}
