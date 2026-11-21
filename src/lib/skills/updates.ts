/**
 * Tells a session when a skill it has read was replaced by a newer version.
 *
 * Versions are SHA-256 hashes from the registry. The session ledger supplies
 * the skills actually used before this feature shipped, so those sessions get
 * one reload notice instead of silently keeping stale instructions.
 *
 * @module @/lib/skills/updates
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb, sessionEvents } from "@/lib/db";
import { getSessionSkills } from "@/lib/repositories/session.skills.repo";
import { shortSkillVersion } from "./utils";
import { skillRegistry } from "./registry";

export interface SkillUpdateNotice {
  name: string;
  /** Hash this session loaded, or null when the old copy was never recorded. */
  previousVersion: string | null;
  currentVersion: string;
}

/** Stable label for the running build; hashes remain the source of truth. */
const SERVER_VERSION_DATE = new Date().toISOString().slice(0, 10);

/** Names already present in old `skill_content` tool results for this session. */
function skillsUsedInEvents(sessionId: string): Set<string> {
  const rows = getDb()
    .select({ data: sessionEvents.data })
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.sessionId, sessionId),
        eq(sessionEvents.type, "tool/result"),
        sql`json_extract(${sessionEvents.data}, '$.message.content') LIKE '%<skill_content name=%'`,
      ),
    )
    .all();

  const names = new Set<string>();
  for (const row of rows) {
    const message = (row.data as { message?: { content?: unknown } }).message;
    const content =
      typeof message?.content === "string"
        ? message.content
        : JSON.stringify(message?.content ?? "");
    for (const match of content.matchAll(/<skill_content name="([^"]+)"/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

/** Changed or unrecorded skills this session should reread before acting. */
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

    for (const name of skillsUsedInEvents(sessionId)) {
      const currentVersion = current.get(name);
      if (currentVersion === undefined || loaded.has(name)) continue;
      notices.push({ name, previousVersion: null, currentVersion });
    }

    return notices.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    // Advisory only: a missing/broken ledger must not block the turn.
    console.warn("[Skill] Could not check skill versions:", error);
    return [];
  }
}

/** Prompt block placed at the very top of the turn; empty when nothing changed. */
export function SkillUpdatesPrompt(
  notices: readonly SkillUpdateNotice[],
): string {
  if (notices.length === 0) return "";

  const lines = notices.map((notice) => {
    const current = shortSkillVersion(notice.currentVersion);
    return notice.previousVersion === null
      ? `- \`${notice.name}\`: used earlier in this session, version not recorded; current is ${current}`
      : `- \`${notice.name}\`: loaded ${shortSkillVersion(notice.previousVersion)}, current is ${current}`;
  });

  return [
    "## Skill updates",
    `The server version started ${SERVER_VERSION_DATE}. These skills must be read again from the current version:`,
    "",
    ...lines,
    "",
    "Reload each one with the `skill` tool before using it. The copy already in this conversation is stale; do not follow it.",
  ].join("\n");
}
