import type { Session } from "@openai-harness/session";
import {
  catalog,
  type UIBlockSpec,
  validateAndNormalizeUI,
} from "@openai-harness/generative-ui";
import { uuidv7 } from "@openai-harness/uuid";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface RenderUIBlockArgs {
  spec: Record<string, unknown>;
}

/** Catalog names, carried on the tool itself so they are never out of reach. */
const COMPONENT_NAMES = Object.keys(catalog.data.components).join(", ");

export const renderUIBlockTool = defineTool({
  name: "renderUIBlock",
  description:
    "Renders an interactive Generative UI block in the chat. Call with a nested component tree spec: " +
    '{ "type": "Stack", "props": { "direction": "column" }, "children": [...] }. ' +
    `Valid component types (use these exact names): ${COMPONENT_NAMES}. ` +
    "Component props and limits are documented in the Available UI Components section of your instructions.",
  timeoutMs: 15000,
  isConcurrencySafe: () => false,
  parameters: {
    spec: {
      type: "object",
      required: true,
      additionalProperties: true,
      description:
        'Nested UI component tree: { type, props, children?: [...] }, rooted at a "Stack" with direction "column".',
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: true,
      properties: {
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: (value as any).summary || "UI block rendered successfully.",
      },
    ],
    presentationMeta: (_args, value) => value,
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "execute",
    title: `Render UI block (${(args.spec as any)?.type || "component"})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: "UI block rendered",
    content: result.content,
  }),
  async execute(args, exec) {
    if (!args.spec) {
      throw new Error("Missing required 'spec' parameter for renderUIBlock.");
    }

    const normalizedSpec = validateAndNormalizeUI(args.spec);
    if (!normalizedSpec) {
      throw new Error("UI specification resulted in an empty spec.");
    }

    toolSession<Session>(exec).append("ui/block", {
      id: uuidv7(),
      spec: normalizedSpec,
    });

    return {
      spec: normalizedSpec as any,
      summary: "UI block rendered successfully.",
    };
  },
});
