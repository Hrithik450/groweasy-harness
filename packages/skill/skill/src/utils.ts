import { parse as parseYaml } from "yaml";
import {
  SKILL_NAME_REGEX,
  type SkillInvocationPolicy,
  type SkillResourceBase,
} from "./types";

export function isSkillName(name: string): boolean {
  return SKILL_NAME_REGEX.test(name);
}

export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase().replace(/_/g, "-");
}

export function isModelInvocable(skill: {
  readonly invocation: SkillInvocationPolicy;
}): boolean {
  return skill.invocation.modelInvocable;
}

export function isUserInvocable(skill: {
  readonly invocation: SkillInvocationPolicy;
}): boolean {
  return skill.invocation.userInvocable;
}

export function parseInvocationPolicy(
  data: Record<string, unknown>,
): SkillInvocationPolicy {
  if (Object.hasOwn(data, "disableModelInvocation")) {
    throw new Error(
      'frontmatter field "disableModelInvocation" is unsupported; use "disable-model-invocation"',
    );
  }
  if (Object.hasOwn(data, "modelInvocable")) {
    throw new Error(
      'frontmatter field "modelInvocable" is unsupported; use "disable-model-invocation"',
    );
  }
  if (Object.hasOwn(data, "userInvocable")) {
    throw new Error(
      'frontmatter field "userInvocable" is unsupported; use "user-invocable"',
    );
  }
  const disableModel = data["disable-model-invocation"];
  const userInvocable = data["user-invocable"];
  return {
    modelInvocable: disableModel !== true && disableModel !== "true",
    userInvocable: userInvocable !== false && userInvocable !== "false",
  };
}

export function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function parseFrontmatter(rawContent: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: rawContent };
  }

  const yamlStr = match[1];
  const content = match[2];
  let data: Record<string, unknown> = {};

  try {
    const parsed = parseYaml(yamlStr);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }

  return { data, content };
}

export function renderResourceHint(skill: {
  provider?: string;
  resourceBase?: SkillResourceBase;
}): string[] {
  const base = skill.resourceBase;
  if (base === undefined) {
    return [
      `Resources for this skill are managed by provider "${escapeText(skill.provider || "bundled")}".`,
      "Load referenced resources only as needed.",
    ];
  }
  switch (base.kind) {
    case "directory":
      return [
        `Base directory for this skill: ${escapeText(base.path)}`,
        "Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.",
      ];
    case "url":
      return [
        `Base URL for this skill: ${escapeText(base.url)}`,
        "Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.",
      ];
    case "opaque":
      return [
        `Resources for this skill: ${escapeText(base.description)}`,
        "Load referenced resources only as needed.",
      ];
    default:
      return [];
  }
}

export function renderSkillContent(skill: {
  name: string;
  provider?: string;
  resourceBase?: SkillResourceBase;
  content: string;
}): string {
  const resourceHint = renderResourceHint(skill);
  return [
    `<skill_content name="${escapeAttr(skill.name)}">`,
    "<skill_resources>",
    ...resourceHint,
    "</skill_resources>",
    "",
    "<skill_instructions>",
    skill.content.trim(),
    "</skill_instructions>",
    "</skill_content>",
  ].join("\n");
}

