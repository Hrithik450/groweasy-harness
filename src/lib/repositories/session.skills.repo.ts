/**
 * Durable record of the skill versions each session has loaded.
 *
 * The registry hash is the authority; this table only answers "which version
 * did this conversation actually read?" so a later turn can spot a change.
 *
 * @module @/lib/repositories/session.skills.repo
 */

import { getDb, sessionSkills, type SessionSkillRow } from "@/lib/db";
import { eq } from "drizzle-orm";

/** Loaded versions for one session, keyed by skill name. */
export function getSessionSkills(
  sessionId: string,
): Map<string, SessionSkillRow> {
  if (!sessionId) return new Map();

  const rows = getDb()
    .select()
    .from(sessionSkills)
    .where(eq(sessionSkills.sessionId, sessionId))
    .all();

  return new Map(rows.map((row) => [row.name, row]));
}

/** Records that a session has now read this exact skill version. */
export function recordSessionSkill(
  sessionId: string,
  name: string,
  version: string,
): void {
  if (!sessionId || !name || !version) return;

  getDb()
    .insert(sessionSkills)
    .values({ sessionId, name, version })
    .onConflictDoUpdate({
      target: [sessionSkills.sessionId, sessionSkills.name],
      set: { version },
    })
    .run();
}
