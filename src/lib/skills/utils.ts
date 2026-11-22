/**
 * Frontmatter parsing, name normalization, invocation checks, and prompt
 * rendering helpers for bundled skills.
 *
 * @module @/lib/skills/utils
 */

import {
  SKILL_NAME_REGEX,
  type SkillInvocationPolicy,
  type SkillResourceBase,
  type SkillSummary,
} from "./types";

/**
 * Parses the simple YAML-style frontmatter used by bundled SKILL.md files
 * without an external dependency.
 */
export function parseFrontmatter(fileContent: string): {
  data: Record<string, string>;
  content: string;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    return { data: {}, content: fileContent };
  }

  const rawYaml = match[1];
  const content = match[2];
  const data: Record<string, string> = {};

  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.substring(0, colonIdx).trim();
    const rawVal = trimmed.substring(colonIdx + 1).trim();
    data[key] = rawVal.replace(/^["']|["']$/g, "");
  }

  return { data, content };
}

/**
 * Normalizes skill names for case-insensitive and delimiter-agnostic lookup.
 * e.g. "query_meta_ads" and "video generation" match "video-generation".
 */
export function normalizeSkillName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-skill(s)?$/i, "");
}

/** Returns whether `name` is a valid kebab-case skill identifier. */
export function isSkillName(name: string): boolean {
  return SKILL_NAME_REGEX.test(name);
}

/** Returns whether the skill is visible to model-facing catalogs and loaders. */
export function isModelInvocable(skill: {
  readonly invocation: SkillInvocationPolicy;
}): boolean {
  return skill.invocation.modelInvocable;
}

/** Returns whether the skill may be invoked directly with a `/name` gesture. */
export function isUserInvocable(skill: {
  readonly invocation: SkillInvocationPolicy;
}): boolean {
  return skill.invocation.userInvocable;
}

/** Renders the model-facing catalog of available skills. */
export function renderSkillCatalog(skills: readonly SkillSummary[]): string {
  if (skills.length === 0) {
    return "No skills are currently available.";
  }

  return [
    "Available skills:",
    ...skills.map(
      (skill) => `- \`${skill.name}\`: ${escapeText(skill.description)}`,
    ),
  ].join("\n");
}

/** First 12 hex characters of a content hash, for prompt-sized display. */
export function shortSkillVersion(version: string): string {
  return version.slice(0, 12);
}

/** Renders a loaded skill as model-facing instruction content. */
export function renderSkillContent(skill: {
  readonly name: string;
  readonly version?: string;
  readonly content: string;
  readonly provider?: string;
  readonly resourceBase?: SkillResourceBase;
}): string {
  const version =
    skill.version === undefined
      ? ""
      : ` version="${escapeAttr(shortSkillVersion(skill.version))}"`;

  return [
    `<skill_content name="${escapeAttr(skill.name)}"${version}>`,
    ...renderResourceHint(skill),
    "<skill_instructions>",
    skill.content.trim(),
    "</skill_instructions>",
    "</skill_content>",
  ].join("\n");
}

function renderResourceHint(skill: {
  readonly provider?: string;
  readonly resourceBase?: SkillResourceBase;
}): string[] {
  const base = skill.resourceBase;
  if (base === undefined) {
    return [
      `<skill_resources>Resources for this skill are managed by provider "${escapeText(skill.provider ?? "bundled")}".</skill_resources>`,
    ];
  }

  switch (base.kind) {
    case "directory":
      return [
        `<skill_resources>Base directory: ${escapeText(base.path)}</skill_resources>`,
      ];
    case "url":
      return [
        `<skill_resources>Base URL: ${escapeText(base.url)}</skill_resources>`,
      ];
    case "opaque":
      return [
        `<skill_resources>${escapeText(base.description)}</skill_resources>`,
      ];
  }
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
