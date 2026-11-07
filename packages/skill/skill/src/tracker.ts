/**
 * In-Memory Ephemeral Skill Tracking & Prerequisite Registry
 *
 * Scoped strictly per user and per session using composed in-memory keys (`${userId}:${sessionId}`).
 * Zero database overhead, purely in-memory Set management, completely isolated per session.
 *
 * @module @openai-harness/skill
 */

import { normalizeSkillName } from "./utils";

export interface SkillContext {
  userId?: string;
  sessionId?: string;
}

const globalForSkills = globalThis as unknown as {
  sessionSkillsMap?: Map<string, Set<string>>;
};

export const sessionSkillsMap =
  globalForSkills.sessionSkillsMap ?? new Map<string, Set<string>>();

if (process.env.NODE_ENV !== "production") {
  globalForSkills.sessionSkillsMap = sessionSkillsMap;
}

/**
 * Normalizes input context into a composed key strictly scoped to the user and session.
 * e.g. "userId:sessionId".
 */
export function resolveSessionKey(
  context: string | SkillContext | undefined,
): string {
  if (!context) return "";
  if (typeof context === "string") return context.trim();

  const uid = context.userId ? context.userId.trim() : "";
  const sid = context.sessionId ? context.sessionId.trim() : "";

  if (uid && sid) return `${uid}:${sid}`;
  return sid || uid;
}

/**
 * Records that a skill has been fetched for the current user & session.
 */
export function recordSkillFetched(
  context: string | SkillContext | undefined,
  skillName: string,
): void {
  if (!skillName) return;
  const normalized = normalizeSkillName(skillName);
  if (!normalized) return;

  const key = resolveSessionKey(context);
  if (!key) return;

  const existing = sessionSkillsMap.get(key) ?? new Set<string>();
  existing.add(normalized);
  sessionSkillsMap.set(key, existing);
}

/**
 * Checks if a specific skill has been fetched for the current user & session.
 */
export function hasSkillBeenFetched(
  context: string | SkillContext | undefined,
  skillName: string,
): boolean {
  if (!skillName) return false;
  const normalized = normalizeSkillName(skillName);
  if (!normalized) return false;

  const key = resolveSessionKey(context);
  if (!key) return false;

  return sessionSkillsMap.get(key)?.has(normalized) ?? false;
}

/**
 * Clears the fetched skills set for a given user & session.
 */
export function clearSessionSkills(
  context: string | SkillContext | undefined,
): void {
  const key = resolveSessionKey(context);
  if (key) {
    sessionSkillsMap.delete(key);
  }
}

export function evaluatePrerequisite(
  context: string | SkillContext | undefined,
  prerequisite: string | string[],
  toolName: string,
): {
  satisfied: boolean;
  instruction?: string;
  error?: string;
} {
  if (!prerequisite) {
    return { satisfied: true };
  }

  if (Array.isArray(prerequisite)) {
    if (prerequisite.length === 0) return { satisfied: true };
    const candidates = prerequisite
      .map((s) => normalizeSkillName(s))
      .filter(Boolean);
    const missing = candidates.filter((s) => !hasSkillBeenFetched(context, s));
    if (missing.length === 0) {
      return { satisfied: true };
    }
    const missingStr = missing.map((s) => `'${s}'`).join(" and ");
    return {
      satisfied: false,
      error: `Prerequisite not met: You must read skill(s) ${missingStr} via fetchSkill before executing '${toolName}'.`,
      instruction: `Prerequisite required: Before calling '${toolName}', you must read skill(s) ${missingStr} using fetchSkill(skillName: '...') to load the required instructions and constraints. Please reference it before calling this tool.`,
    };
  }

  const raw = prerequisite.trim();
  if (!raw) return { satisfied: true };

  const isOrCondition =
    /\b(or)\b/i.test(raw) ||
    raw.includes("/") ||
    raw.includes("|") ||
    /^either\b/i.test(raw);

  if (isOrCondition) {
    const rawTokens = raw
      .replace(/^either\s+/i, "")
      .split(/\s+or\s+|\s*\/\s*|\s*\|\s*|\s*,\s*or\s*/i);

    const candidates = Array.from(
      new Set(rawTokens.map((t) => normalizeSkillName(t)).filter(Boolean)),
    );

    if (candidates.length === 0) return { satisfied: true };

    const anyFetched = candidates.some((c) => hasSkillBeenFetched(context, c));
    if (anyFetched) {
      return { satisfied: true };
    }

    const candidateStr = candidates.map((c) => `'${c}'`).join(" or ");
    return {
      satisfied: false,
      error: `Prerequisite not met: You must read either ${candidateStr} via fetchSkill before executing '${toolName}'. Please reference it before calling this tool.`,
      instruction: `Prerequisite required: Before calling '${toolName}', you must read either ${candidateStr} using fetchSkill(skillName: '...') to load the required instructions and constraints. Please reference it before calling this tool.`,
    };
  }

  const isAndCondition = /\b(and)\b/i.test(raw) || raw.includes(",");
  if (isAndCondition) {
    const rawTokens = raw.split(/\s+and\s+|\s*,\s*|\s*&\s*/i);
    const candidates = Array.from(
      new Set(rawTokens.map((t) => normalizeSkillName(t)).filter(Boolean)),
    );

    if (candidates.length === 0) return { satisfied: true };

    const missing = candidates.filter((c) => !hasSkillBeenFetched(context, c));
    if (missing.length === 0) {
      return { satisfied: true };
    }

    const missingStr = missing.map((s) => `'${s}'`).join(" and ");
    return {
      satisfied: false,
      error: `Prerequisite not met: You must read skill(s) ${missingStr} via fetchSkill before executing '${toolName}'.`,
      instruction: `Prerequisite required: Before calling '${toolName}', you must read skill(s) ${missingStr} using fetchSkill to load the required instructions and constraints. Please reference it before calling this tool.`,
    };
  }

  const singleCandidate = normalizeSkillName(raw);
  if (!singleCandidate) return { satisfied: true };

  if (hasSkillBeenFetched(context, singleCandidate)) {
    return { satisfied: true };
  }

  return {
    satisfied: false,
    error: `Prerequisite not met: You must read skill '${singleCandidate}' via fetchSkill before executing '${toolName}'. Please reference it before calling this tool.`,
    instruction: `Prerequisite required: Before calling '${toolName}', you must read the skill '${singleCandidate}' using fetchSkill(skillName: '${singleCandidate}') to load the required instructions and constraints. Please reference it before calling this tool.`,
  };
}
