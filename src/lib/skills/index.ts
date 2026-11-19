/**
 * Public skill surface: catalog listing and body lookup for bundled skills.
 * Skills are always available; there is no tracker or prerequisite state.
 *
 * @module @/lib/skills
 */

import { skillRegistry } from "./registry";
import type { SkillCategory, SkillDefinition, SkillSummary } from "./types";

export * from "./types";
export * from "./utils";
export * from "./registry";

/** Lists bundled skills, optionally narrowed to one category. */
export function listSkills(category?: SkillCategory): SkillSummary[] {
  const skills = skillRegistry.list();
  return category === undefined
    ? skills
    : skills.filter((skill) => skill.category === category);
}

/** Loads one skill's frontmatter and instruction body by name. */
export function getSkill(name: string): SkillDefinition | null {
  return skillRegistry.get(name) ?? null;
}
