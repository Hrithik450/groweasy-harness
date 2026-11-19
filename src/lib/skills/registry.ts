/**
 * Bundled skill registry: one entry per markdown skill under `src/lib/skills`,
 * with frontmatter and instruction bodies loaded on demand.
 *
 * @module @/lib/skills/registry
 */

import fs from "fs";
import path from "path";
import {
  type SkillDefinition,
  type SkillEntry,
  type SkillSummary,
} from "./types";
import { isSkillName, normalizeSkillName, parseFrontmatter } from "./utils";

/** The seven bundled skills, their categories, and their markdown paths. */
export const SKILL_REGISTRY = {
  "static-ad": {
    name: "static-ad",
    category: "creative",
    path: "src/lib/skills/static-ad/SKILL.md",
  },
  "competitor-research": {
    name: "competitor-research",
    category: "meta",
    path: "src/lib/skills/competitor-research/SKILL.md",
  },
  "campaign-health": {
    name: "campaign-health",
    category: "account",
    path: "src/lib/skills/campaign-health/SKILL.md",
  },
  alerts: {
    name: "alerts",
    category: "account",
    path: "src/lib/skills/alerts/SKILL.md",
  },
  suggestions: {
    name: "suggestions",
    category: "account",
    path: "src/lib/skills/suggestions/SKILL.md",
  },
  ffmpeg: {
    name: "ffmpeg",
    category: "composition",
    path: "src/lib/skills/ffmpeg/SKILL.md",
  },
  "business-profile": {
    name: "business-profile",
    category: "account",
    path: "src/lib/skills/business-profile/SKILL.md",
  },
  "campaign-builder": {
    name: "campaign-builder",
    category: "meta",
    path: "src/lib/skills/campaign-builder/SKILL.md",
  },
  ideas: {
    name: "ideas",
    category: "creative",
    path: "src/lib/skills/ideas/SKILL.md",
  },
  creatives: {
    name: "creatives",
    category: "creative",
    path: "src/lib/skills/creatives/SKILL.md",
  },
  reports: {
    name: "reports",
    category: "account",
    path: "src/lib/skills/reports/SKILL.md",
  },
  "campaign-brief": {
    name: "campaign-brief",
    category: "meta",
    path: "src/lib/skills/campaign-brief/SKILL.md",
  },
  "video-ad": {
    name: "video-ad",
    category: "creative",
    path: "src/lib/skills/video-ad/SKILL.md",
  },
} as const satisfies Record<string, SkillEntry>;

export type SkillName = keyof typeof SKILL_REGISTRY;

function resolveSkillPath(entry: SkillEntry): string {
  return path.isAbsolute(entry.path)
    ? entry.path
    : path.join(process.cwd(), entry.path);
}

function loadSkill(entry: SkillEntry): SkillDefinition | null {
  const absolutePath = resolveSkillPath(entry);
  if (!fs.existsSync(absolutePath)) return null;

  const rawContent = fs.readFileSync(absolutePath, "utf-8");
  const { data, content } = parseFrontmatter(rawContent);
  const frontmatterName = data.name?.trim() ?? "";
  const name = isSkillName(frontmatterName) ? frontmatterName : entry.name;

  return {
    name,
    category: entry.category,
    description: data.description?.trim() ?? "",
    content: content.trim(),
    provider: "bundled",
    invocation: { modelInvocable: true, userInvocable: true },
  };
}

/**
 * Read-only view over {@link SKILL_REGISTRY}. Skills are always available:
 * listing returns every skill and lookup resolves any registered name.
 */
class BundledSkillRegistry {
  /** Lists invocation-neutral summaries for all readable bundled skills. */
  list(): SkillSummary[] {
    return Object.values(SKILL_REGISTRY)
      .map((entry) => loadSkill(entry))
      .filter((skill): skill is SkillDefinition => skill !== null)
      .map(({ name, category, description }) => ({
        name,
        category,
        description,
      }));
  }

  /** Loads one skill's frontmatter and instruction body, or `undefined`. */
  get(name: string): SkillDefinition | undefined {
    const normalized = normalizeSkillName(name);
    if (!isSkillName(normalized)) return undefined;

    const entry = SKILL_REGISTRY[normalized as SkillName];
    return entry === undefined ? undefined : (loadSkill(entry) ?? undefined);
  }
}

export const skillRegistry = new BundledSkillRegistry();
