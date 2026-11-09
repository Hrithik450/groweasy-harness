/**
 * Bundled `reports` skill provider.
 *
 * Assets live in `assets/reports/SKILL.md`; the candidate is discovered once
 * and the body is served from the same file. Provider id and skill name are the
 * frontmatter name verbatim.
 *
 * @module @openai-harness/skill-reports
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import {
  BUNDLED_SKILL_RANK,
  parseFrontmatter,
  type SkillCandidate,
  type SkillDefinition,
  type SkillLookupOptions,
  type SkillProvider,
} from "@openai-harness/skill";

const SKILL_NAME = "reports";
const SKILL_URL = new URL("../assets/reports/SKILL.md", import.meta.url);
const RESOURCE_BASE = {
  kind: "directory",
  path: fileURLToPath(new URL("../assets/reports/", import.meta.url)),
} as const;
const INVOCATION = { modelInvocable: true, userInvocable: true } as const;

const RAW = readFileSync(SKILL_URL, "utf8");
const PARSED = parseFrontmatter(RAW);
const DESCRIPTION = typeof PARSED.data.description === "string"
  ? PARSED.data.description.trim()
  : "";
if (DESCRIPTION.length === 0) {
  throw new Error("skill-reports: SKILL.md has no description");
}

const CANDIDATE: SkillCandidate = {
  name: SKILL_NAME,
  description: DESCRIPTION,
  invocation: INVOCATION,
  source: "bundled",
  provider: SKILL_NAME,
  rank: BUNDLED_SKILL_RANK,
  path: fileURLToPath(SKILL_URL),
  resourceBase: RESOURCE_BASE,
  metadata: PARSED.data,
};

/** The bundled provider exposed by this package. */
export const provider: SkillProvider = {
  name: SKILL_NAME,
  list(_options: SkillLookupOptions = {}): Promise<SkillCandidate[]> {
    return Promise.resolve([CANDIDATE]);
  },
  get(
    _name: string,
    _options: SkillLookupOptions = {},
  ): Promise<SkillDefinition> {
    return Promise.resolve({
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      source: CANDIDATE.source,
      provider: CANDIDATE.provider,
      path: CANDIDATE.path,
      resourceBase: RESOURCE_BASE,
      metadata: PARSED.data,
      content: PARSED.content.trim(),
    });
  },
};

/** Cordis plugin name. */
export const name = "skill-reports";
/** The skills service must exist before the provider can register. */
export const inject = ["skills"];

/**
 * Register this package's provider on `ctx.skills`.
 * @param ctx - context carrying the skill service.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.skills.registerProvider(provider));
}
