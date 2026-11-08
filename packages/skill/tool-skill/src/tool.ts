/**
 * Model-facing `skill` loader tool.
 *
 * The tool is factory-built so the host supplies its skill registry and the
 * callback that records a model-invoked skill for prerequisite checks. The
 * package itself owns only the schema, scope-aware lookup, rendering, and
 * presentation.
 *
 * @module @openai-harness/tool-skill
 */

import {
  isModelInvocable,
  isSkillName,
  renderSkillContent,
  type SkillDefinition,
  type SkillViewOptions,
} from "@openai-harness/skill";
import { defineTool, type ToolDefinition } from "@openai-harness/tools";

/** The registry surface this tool needs; structurally satisfied by `SkillRegistry`. */
export interface SkillToolRegistry {
  get(
    name: string,
    options?: SkillViewOptions,
  ): Promise<SkillDefinition | undefined>;
}

/** Session identity recorded when the model loads a skill. */
export interface SkillFetchedContext {
  readonly userId?: string;
  readonly sessionId?: string;
}

export interface SkillToolOptions {
  /** Host registry that resolves the winning skill for a name and scope. */
  readonly registry: SkillToolRegistry;
  /** Host callback recording the load for prerequisite tracking. */
  readonly onFetched?: (context: SkillFetchedContext, name: string) => void;
}

/**
 * Build the model-facing skill loader.
 *
 * @param options - host registry and optional fetch-recorded callback.
 * @returns a registered-ready tool definition.
 */
export function createSkillTool(options: SkillToolOptions): ToolDefinition {
  return defineTool({
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
          content: { type: "string", required: true },
        },
      },
      render: (_args, value) => [
        { type: "text", text: renderSkillContent(value) },
      ],
      presentationMeta: (_args, value) => ({ name: value.name }),
    },
    presentCall: (args) => ({
      card: "generic",
      kind: "read",
      title: `Load skill ${args.name}`,
      rawInput: args.name,
    }),
    presentResult: (args, result) => ({
      card: "generic",
      kind: "read",
      title: `Skill loaded: ${args.name}`,
      content: result.content,
    }),
    async execute(args, exec) {
      if (!isSkillName(args.name)) {
        throw new Error(`invalid skill name "${args.name}"`);
      }

      const scope = exec.scope ?? exec.agent?.session.header.agentPreset;
      const skill = await options.registry.get(args.name, {
        signal: exec.signal,
        scope,
      });
      if (skill === undefined || !isModelInvocable(skill)) {
        throw new Error(
          `skill "${args.name}" is unknown or not available for model invocation`,
        );
      }

      const session = exec.agent?.session;
      if (session !== undefined) {
        options.onFetched?.(
          { userId: session.userId, sessionId: session.id },
          skill.name,
        );
      }

      return {
        name: skill.name,
        provider: skill.provider,
        ...(skill.resourceBase !== undefined
          ? { resourceBase: skill.resourceBase }
          : {}),
        content: skill.content,
      };
    },
  });
}
