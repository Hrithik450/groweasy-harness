/**
 * Model-facing `skill` loader tool. Loads a bundled skill's full instruction
 * body; skills are always available, with no fetch tracking or gating.
 *
 * @module @/lib/skills/tool
 */

import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { recordSessionSkill } from "@/lib/repositories/session.skills.repo";
import { skillRegistry } from "./registry";
import type { SkillResourceBase } from "./types";
import { isModelInvocable, isSkillName, renderSkillContent } from "./utils";

export const skillToolDefinition = {
  type: "function" as const,
  name: "skill",
  description:
    "Load the full instructions for a skill. Call it before acting on a task that names or clearly matches a skill in the session skill catalog.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The exact skill name from the available skills list.",
      },
    },
    required: ["name"],
  },
};

export interface SkillToolArgs {
  name: string;
}

export interface SkillToolResult {
  contentParts: Array<InputContentParam>;
  name: string;
  version: string;
  content: string;
  provider: string;
  resourceBase?: SkillResourceBase;
}

export async function executeSkillTool(
  input: ToolInput<SkillToolArgs>,
): Promise<ToolOutput<SkillToolResult>> {
  const name = input.args?.name;
  if (!name || !isSkillName(name)) {
    return failure(`invalid skill name "${name ?? ""}"`);
  }

  const skill = skillRegistry.get(name);
  if (skill === undefined || !isModelInvocable(skill)) {
    return failure(`skill "${name}" is unknown or not available`);
  }

  const resourceBase =
    skill.resourceBase === undefined ? undefined : skill.resourceBase;

  const sessionId = input.context?.sessionId;
  if (sessionId) {
    try {
      recordSessionSkill(sessionId, skill.name, skill.version);
    } catch (error) {
      // The content is still valid; the next turn just cannot diff versions.
      console.warn(`[Skill] Could not record load for ${skill.name}:`, error);
    }
  }

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: renderSkillContent({
            name: skill.name,
            version: skill.version,
            content: skill.content,
            provider: skill.provider,
            resourceBase,
          }),
        },
      ],
      name: skill.name,
      version: skill.version,
      content: skill.content,
      provider: skill.provider,
      ...(resourceBase === undefined ? {} : { resourceBase }),
    },
  };
}
