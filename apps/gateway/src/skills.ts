/**
 * Bundled skill registry and the model-facing skill tool.
 *
 * The layered provider registry, bundled filesystem provider, prerequisite
 * tracker, and catalog middleware live in `@openai-harness/skill` and
 * `@openai-harness/tool-skill`. This module builds the deployment's single
 * registry, roots it at the workspace's packaged `assets/` trees, and binds the
 * skill tool's visibility to the canonical tool registry.
 *
 * @module @openai-harness/gateway/wiring/skills
 */

import path from "node:path";
import { PROJECT_ROOT } from "@openai-harness/paths";
import {
  BundledFileSystemSkillProvider,
  SkillRegistry,
  recordSkillFetched,
} from "@openai-harness/skill";
import {
  configureSkillPreStep,
  createSkillTool,
} from "@openai-harness/tool-skill";
import { toolRegistry } from "@openai-harness/tools";

/** Each skill package contributes its `assets/<skill>/SKILL.md` subtree. */
const bundledSkillRoot = path.join(PROJECT_ROOT, "packages", "skill");

/** The deployment's layered skill registry. */
export const skillRegistry = new SkillRegistry();

skillRegistry.registerProvider(
  new BundledFileSystemSkillProvider(bundledSkillRoot),
);

/** Model-facing `skill` tool bound to the registry and prerequisite tracker. */
export const skillTool = createSkillTool({
  registry: skillRegistry,
  onFetched: (context, name) => recordSkillFetched(context, name),
});

configureSkillPreStep({
  registry: skillRegistry,
  isSkillToolVisible: (scope) =>
    toolRegistry.get(skillTool.name, scope) === skillTool,
});

export * from "@openai-harness/skill/src/types";
export * from "@openai-harness/skill/src/utils";
export * from "@openai-harness/skill/src/registry";
export * from "@openai-harness/skill/src/tracker";
export * from "@openai-harness/tool-skill";
