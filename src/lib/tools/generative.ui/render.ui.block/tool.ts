import type { ToolEvent, ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  type CanonicalUIMesssage,
  validateAndNormalizeUI,
} from "@/lib/generative.ui";
import {
  formatRejection,
  validateUIBlockFormat,
} from "@/lib/skills/format.judge";

export const renderUIBlockToolDefinition = {
  type: "function" as const,
  name: "renderUIBlock",
  description:
    "Renders an interactive Generative UI block in the chat. Call with a flatten component tree spec.",
  parameters: {
    type: "object",
    properties: {
      spec: {
        type: "object",
        description:
          "Flatten UI component tree: { type, props, children?: [...] }.",
      },
    },
    required: ["spec"],
  },
};

export interface RenderUIBlockArgs {
  spec?: unknown;
}

/** Runtime affordances the agent loop adds to a tool's caller context. */
interface RenderUIBlockContext {
  emitEvent?: (event: ToolEvent) => void | Promise<void>;
}

type RenderUIBlockInput = ToolInput<RenderUIBlockArgs> & {
  context?: ToolInput<RenderUIBlockArgs>["context"] & RenderUIBlockContext;
};

export async function executeRenderUIBlockTool(
  input: RenderUIBlockInput,
): Promise<
  ToolOutput<{
    spec?: CanonicalUIMesssage;
    contentParts: Array<InputContentParam>;
  }>
> {
  if (!input.args?.spec) {
    return {
      success: false,
      error: "Missing required 'spec' parameter for renderUIBlock.",
      data: {
        contentParts: [
          {
            type: "input_text",
            text: "Error: Missing required 'spec' parameter for renderUIBlock.",
          },
        ],
      },
    };
  }

  try {
    const normalizedSpec = validateAndNormalizeUI(input.args.spec);
    if (!normalizedSpec) {
      throw new Error("UI specification resulted in an empty spec.");
    }

    // verdict goes back to the loop as the tool result, so the model can retry.
    const verdict = await validateUIBlockFormat(normalizedSpec, input.context);
    if (verdict !== null && !verdict.pass) {
      const rejection = formatRejection(verdict);
      return {
        success: false,
        error: rejection,
        data: {
          contentParts: [{ type: "input_text", text: rejection }],
        },
      };
    }

    if (input.context?.emitEvent) {
      await input.context.emitEvent({
        type: "ui/block",
        spec: normalizedSpec,
      });
    }

    return {
      success: true,
      data: {
        spec: normalizedSpec,
        contentParts: [
          {
            type: "input_text",
            text: `Successfully rendered UI block (${normalizedSpec.root}).`,
          },
        ],
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: errorMsg,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Error validating UI block: ${errorMsg}`,
          },
        ],
      },
    };
  }
}
