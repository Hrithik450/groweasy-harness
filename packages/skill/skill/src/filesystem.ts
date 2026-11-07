/**
 * Bundled `SKILL.md` filesystem provider.
 *
 * The reference harness ships its local filesystem provider as the standalone
 * `skill-filesystem` package. This repository's application may only depend on
 * the already-installed `@openai-harness/skill` package, so the reusable
 * provider class lives here; `packages/skill/skill-filesystem` is the Cordis
 * plugin package that mounts it as `ctx.skills` provider.
 *
 * @module @openai-harness/skill
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillLookupOptions,
  type SkillProvider,
} from "./types";
import {
  isSkillName,
  normalizeSkillName,
  parseFrontmatter,
  parseInvocationPolicy,
} from "./utils";

/** One discovered bundled skill, retained with the file that produced it. */
interface BundledSkillEntry {
  readonly candidate: SkillCandidate;
  readonly filePath: string;
}

/**
 * Skill provider backed by the repository's bundled `SKILL.md` tree.
 *
 * Discovery walks the root once per call, skipping dot entries and
 * `node_modules`, and parses each `SKILL.md` frontmatter. Bodies are re-read on
 * `get()` so a removed file loads as absent.
 */
export class BundledFileSystemSkillProvider implements SkillProvider {
  readonly name = "bundled";

  constructor(
    // Resolved from this module so discovery works from any working directory.
    private readonly rootDir: string = path.dirname(fileURLToPath(import.meta.url)),
  ) {}

  async list(options: SkillLookupOptions = {}): Promise<SkillCandidate[]> {
    options.signal?.throwIfAborted();
    return discoverBundledSkills(this.rootDir, options.signal).map(
      (entry) => entry.candidate,
    );
  }

  async get(
    name: string,
    options: SkillLookupOptions = {},
  ): Promise<SkillDefinition | undefined> {
    options.signal?.throwIfAborted();
    const entry = discoverBundledSkills(this.rootDir, options.signal).find(
      (candidate) => candidate.candidate.name === name,
    );
    if (entry === undefined) return undefined;
    options.signal?.throwIfAborted();

    let content: string;
    try {
      const raw = fs.readFileSync(entry.filePath, "utf-8");
      content = parseFrontmatter(raw).content.trim();
    } catch {
      return undefined;
    }

    const candidate = entry.candidate;
    return {
      name: candidate.name,
      description: candidate.description,
      ...(candidate.whenToUse !== undefined
        ? { whenToUse: candidate.whenToUse }
        : {}),
      invocation: candidate.invocation,
      source: candidate.source,
      provider: this.name,
      ...(candidate.path !== undefined ? { path: candidate.path } : {}),
      ...(candidate.resourceBase !== undefined
        ? { resourceBase: candidate.resourceBase }
        : {}),
      content,
      ...(candidate.metadata !== undefined
        ? { metadata: candidate.metadata }
        : {}),
    };
  }
}

function discoverBundledSkills(
  rootDir: string,
  signal?: AbortSignal,
): BundledSkillEntry[] {
  if (!fs.existsSync(rootDir)) return [];

  const skillFiles: string[] = [];
  const scan = (dir: string): void => {
    signal?.throwIfAborted();
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        skillFiles.push(full);
      }
    }
  };
  scan(rootDir);

  const results: BundledSkillEntry[] = [];
  for (const filePath of skillFiles) {
    signal?.throwIfAborted();
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data } = parseFrontmatter(raw);
      const name =
        typeof data.name === "string" && data.name.trim().length > 0
          ? normalizeSkillName(data.name.trim())
          : normalizeSkillName(path.basename(path.dirname(filePath)));
      if (!isSkillName(name)) continue;

      const description =
        typeof data.description === "string" ? data.description.trim() : "";
      const whenToUse =
        typeof data.whenToUse === "string" ? data.whenToUse.trim() : undefined;
      const directory = path.dirname(filePath);

      results.push({
        filePath,
        candidate: {
          name,
          description,
          ...(whenToUse ? { whenToUse } : {}),
          invocation: parseInvocationPolicy(data),
          source: "bundled",
          provider: "bundled",
          rank: BUNDLED_SKILL_RANK,
          path: filePath,
          resourceBase: { kind: "directory", path: directory },
          metadata: data,
        },
      });
    } catch {
      // An unparseable skill file is ignored; the rest of the tree still loads.
    }
  }

  return results;
}
