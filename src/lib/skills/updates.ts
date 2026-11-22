/**
 * Tells a session when a skill it read was replaced by a newer version.
 *
 * Versions are SHA-256 hashes. The session skill ledger supplies the hashes
 * this session loaded; a mismatch with the registry means the copy in the
 * conversation is stale.
 *
 * @module @/lib/skills/updates
 */

import { getSessionSkills } from "@/lib/repositories/session.skills.repo";
import { skillRegistry } from "./registry";

export interface SkillUpdateNotice {
  name: string;
  /** Hash this session loaded. */
  previousVersion: string;
  currentVersion: string;
}

/** Skills whose current hash differs from the hash this session loaded. */
export function getSkillUpdates(sessionId: string): SkillUpdateNotice[] {
  if (!sessionId) return [];

  try {
    const current = new Map(
      skillRegistry.list().map((skill) => [skill.name, skill.version]),
    );
    const loaded = getSessionSkills(sessionId);
    const notices: SkillUpdateNotice[] = [];

    for (const [name, skill] of loaded) {
      const currentVersion = current.get(name);
      if (currentVersion !== undefined && currentVersion !== skill.version) {
        notices.push({
          name,
          previousVersion: skill.version,
          currentVersion,
        });
      }
    }

    return notices.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    // Advisory only: a missing/broken ledger must not block the turn.
    console.warn("[Skill] Could not check skill versions:", error);
    return [];
  }
}
