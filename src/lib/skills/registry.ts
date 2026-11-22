/**
 * Bundled skill registry: one entry per markdown skill under `src/lib/skills`,
 * with frontmatter and instruction bodies loaded on demand.
 *
 * @module @/lib/skills/registry
 */

import { createHash } from "node:crypto";
import fs from "fs";
import path from "path";
import {
  type SkillDefinition,
  type SkillEntry,
  type SkillSummary,
} from "./types";
import { isSkillName, normalizeSkillName, parseFrontmatter } from "./utils";

/** The bundled skills and their markdown paths. */
export const SKILL_REGISTRY = {
  "static-ad": {
    name: "static-ad",
    path: "src/lib/skills/static-ad/SKILL.md",
  },
  "competitor-research": {
    name: "competitor-research",
    path: "src/lib/skills/competitor-research/SKILL.md",
  },
  "campaign-health": {
    name: "campaign-health",
    path: "src/lib/skills/campaign-health/SKILL.md",
  },
  "ads-classifier": {
    name: "ads-classifier",
    path: "src/lib/skills/ads-classifier/SKILL.md",
  },
  alerts: {
    name: "alerts",
    path: "src/lib/skills/alerts/SKILL.md",
  },
  suggestions: {
    name: "suggestions",
    path: "src/lib/skills/suggestions/SKILL.md",
  },
  ffmpeg: {
    name: "ffmpeg",
    path: "src/lib/skills/ffmpeg/SKILL.md",
  },
  "business-profile": {
    name: "business-profile",
    path: "src/lib/skills/business-profile/SKILL.md",
  },
  ideas: {
    name: "ideas",
    path: "src/lib/skills/ideas/SKILL.md",
  },
  creatives: {
    name: "creatives",
    path: "src/lib/skills/creatives/SKILL.md",
  },
  "daily-report": {
    name: "daily-report",
    path: "src/lib/skills/daily-report/SKILL.md",
  },
  "campaign-brief": {
    name: "campaign-brief",
    path: "src/lib/skills/campaign-brief/SKILL.md",
  },
  "video-ad": {
    name: "video-ad",
    path: "src/lib/skills/video-ad/SKILL.md",
  },
  "video-service-config": {
    name: "video-service-config",
    path: "src/lib/skills/video-service-config/SKILL.md",
  },
} as const satisfies Record<string, SkillEntry>;

export type SkillName = keyof typeof SKILL_REGISTRY;

function resolveSkillPath(entry: SkillEntry): string {
  return path.isAbsolute(entry.path)
    ? entry.path
    : path.join(process.cwd(), entry.path);
}

interface CachedSkill {
  size: number;
  mtimeMs: number;
  skill: SkillDefinition;
}

/** Avoid re-reading and re-hashing unchanged files on every model step. */
const skillCache = new Map<string, CachedSkill>();

function loadSkill(entry: SkillEntry): SkillDefinition | null {
  const absolutePath = resolveSkillPath(entry);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return null;
  }

  const cached = skillCache.get(absolutePath);
  if (
    cached !== undefined &&
    cached.mtimeMs === stat.mtimeMs &&
    cached.size === stat.size
  ) {
    return cached.skill;
  }

  const rawContent = fs.readFileSync(absolutePath, "utf-8");
  const { data, content } = parseFrontmatter(rawContent);
  const frontmatterName = data.name?.trim() ?? "";
  const name = isSkillName(frontmatterName) ? frontmatterName : entry.name;

  const skill: SkillDefinition = {
    name,
    description: data.description?.trim() ?? "",
    version: createHash("sha256").update(rawContent).digest("hex"),
    content: content.trim(),
    provider: "bundled",
    invocation: { modelInvocable: true, userInvocable: true },
  };

  skillCache.set(absolutePath, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    skill,
  });
  return skill;
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
      .map(({ name, description, version }) => ({
        name,
        description,
        version,
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
