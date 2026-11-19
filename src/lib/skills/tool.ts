/**
 * Model-facing `skill` loader tool. Loads a bundled skill's full instruction
 * body; skills are always available, with no fetch tracking or gating.
 *
 * @module @/lib/skills/tool
 */

import { defineTool } from "@/lib/tools/schema";
import { skillRegistry } from "./registry";
import { isModelInvocable, isSkillName, renderSkillContent } from "./utils";

export const skillTool = defineTool({
  name: "skill",
  description:
    "Load the full instructions for a skill. Call it before acting on a task that names or clearly matches a skill in the session skill catalog.",
  timeoutMs: 10000,
  isConcurrencySafe: () => true,
  parameters: {
    name: {
      type: "string",
      required: true,
      description: "The exact skill name from the available skills list.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", required: true },
        content: { type: "string", required: true },
        provider: { type: "string", required: true },
        resourceBase: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { type: "string", required: true, const: "directory" },
                path: { type: "string", required: true },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { type: "string", required: true, const: "url" },
                url: { type: "string", required: true },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: { type: "string", required: true, const: "opaque" },
                description: { type: "string", required: true },
              },
            },
          ],
        },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: renderSkillContent(value),
      },
    ],
    presentationMeta: (_args, value) => ({ name: value.name }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "read",
    title: `Load skill: ${args.name}`,
    rawInput: args,
  }),
  presentResult: (args, result) => ({
    card: "generic",
    kind: "read",
    title: `Skill loaded: ${args.name}`,
    content: result.content,
  }),
  async execute(args) {
    if (!isSkillName(args.name)) {
      throw new Error(`invalid skill name "${args.name}"`);
    }

    const skill = skillRegistry.get(args.name);
    if (skill === undefined || !isModelInvocable(skill)) {
      throw new Error(`skill "${args.name}" is unknown or not available`);
    }

    return {
      name: skill.name,
      content: skill.content,
      provider: skill.provider,
      ...(skill.resourceBase === undefined
        ? {}
        : { resourceBase: skill.resourceBase }),
    };
  },
});
