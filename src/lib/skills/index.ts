/**
 * Public skill surface: catalog listing and body lookup for bundled skills.
 * Skills are always available; there is no tracker or prerequisite state.
 *
 * @module @/lib/skills
 */

import { skillRegistry } from "./registry";
import type { SkillDefinition, SkillSummary } from "./types";

export * from "./types";
export * from "./utils";
export * from "./registry";

/** Lists every bundled skill. */
export function listSkills(): SkillSummary[] {
  return skillRegistry.list();
}

/** Loads one skill's frontmatter and instruction body by name. */
export function getSkill(name: string): SkillDefinition | null {
  return skillRegistry.get(name) ?? null;
}
