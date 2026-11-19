/**
 * Skill contract types shared by the registry and the skill tool.
 *
 * @module @/lib/skills/types
 */

export const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Domain buckets used by catalog filtering and the `listSkills` tool. */
export const SKILL_CATEGORIES = [
  "account",
  "meta",
  "creative",
  "composition",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/** Provider-specific base for relative resources referenced by a skill body. */
export type SkillResourceBase =
  | { readonly kind: "directory"; readonly path: string }
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "opaque"; readonly description: string };

/**
 * Invocation controls. Every bundled skill enables both surfaces: skills are
 * always available, with no fetch bookkeeping or prerequisite gating.
 */
export interface SkillInvocationPolicy {
  readonly modelInvocable: boolean;
  readonly userInvocable: boolean;
}

/** Invocation-neutral metadata returned by catalog listings. */
export interface SkillSummary {
  readonly name: string;
  readonly category: SkillCategory;
  readonly description: string;
}

/** Registry entry describing where one bundled skill lives on disk. */
export interface SkillEntry {
  readonly name: string;
  readonly category: SkillCategory;
  readonly path: string;
}

/** Complete parsed skill, including the instruction body loaded on demand. */
export interface SkillDefinition extends SkillSummary {
  readonly content: string;
  readonly provider: string;
  readonly invocation: SkillInvocationPolicy;
  readonly resourceBase?: SkillResourceBase;
}
