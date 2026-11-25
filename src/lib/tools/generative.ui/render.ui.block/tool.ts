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

/** Hard limits per turn; a render loop must never run forever. */
const MAX_RENDER_ATTEMPTS = 4;
const MAX_CONSECUTIVE_REJECTIONS = 4;

interface TurnRenderState {
  /** Every renderUIBlock call in this turn, successful or not. */
  attempts: number;
  /** Validation failures since the last successful render. */
  rejected: number;
  /** The last spec that actually rendered, for duplicate detection. */
  lastSpec: string | null;
  /** Newest spec that normalized; emitted when the judge never passes. */
  lastCandidate: CanonicalUIMesssage | null;
}

/**
 * Per `session:turn` render state.
 *
 * The model retries a rejected block by design, and it can also re-send a block
 * that already passed. Without a ceiling either case keeps the turn alive
 * forever, so the fourth attempt in a turn ends it instead.
 */
const renderStateByTurn = new Map<string, TurnRenderState>();

function turnKey(input: RenderUIBlockInput): string {
  return `${input.context?.sessionId ?? "no-session"}:${input.context?.turn ?? 0}`;
}

function renderStateFor(key: string): TurnRenderState {
  const existing = renderStateByTurn.get(key);
  if (existing) return existing;
  if (renderStateByTurn.size > 2000) renderStateByTurn.clear();
  const fresh: TurnRenderState = {
    attempts: 0,
    rejected: 0,
    lastSpec: null,
    lastCandidate: null,
  };
  renderStateByTurn.set(key, fresh);
  return fresh;
}

type RenderUIBlockOutput = ToolOutput<{
  spec?: CanonicalUIMesssage;
  contentParts: Array<InputContentParam>;
}> & { concludesTurn?: boolean };

/** Runtime affordances the agent loop adds to a tool's caller context. */
interface RenderUIBlockContext {
  emitEvent?: (event: ToolEvent) => void | Promise<void>;
}

type RenderUIBlockInput = ToolInput<RenderUIBlockArgs> & {
  context?: ToolInput<RenderUIBlockArgs>["context"] & RenderUIBlockContext;
};

/** Stop the turn with one visible notice; the only exit from a render loop. */
async function abortTurn(
  input: RenderUIBlockInput,
  message: string,
  notice: string,
): Promise<RenderUIBlockOutput> {
  try {
    await input.context?.emitEvent?.({
      type: "ui/block",
      spec: {
        root: "root",
        elements: {
          root: {
            type: "Stack",
            props: {
              direction: "vertical",
              gap: "sm",
              align: "stretch",
              justify: "start",
            },
            children: ["note"],
          },
          note: {
            type: "Text",
            props: { text: notice, size: "sm" },
          },
        },
      },
    });
  } catch {
    // The notice is best-effort; the turn still stops.
  }

  return {
    success: false,
    error: `${message} The turn was stopped so it cannot loop; the user must retry.`,
    concludesTurn: true,
    data: { contentParts: [{ type: "input_text", text: notice }] },
  };
}

/**
 * Emit the newest normalized draft when the judge never passes. The user gets
 * a real view instead of an apology; the turn is not concluded, so the agent
 * can still save its work.
 */
async function renderLastCandidate(
  input: RenderUIBlockInput,
  state: TurnRenderState,
): Promise<RenderUIBlockOutput> {
  const candidate = state.lastCandidate;
  if (!candidate) {
    return abortTurn(
      input,
      "The view could not be prepared.",
      "I couldn't prepare this view. Please retry.",
    );
  }

  try {
    await input.context?.emitEvent?.({ type: "ui/block", spec: candidate });
  } catch {
    // Rendering the fallback is best-effort; the draft still goes back.
  }

  state.lastSpec = JSON.stringify(candidate);
  state.rejected = 0;

  return {
    success: true,
    data: {
      spec: candidate,
      contentParts: [{ type: "input_text", text: "Rendered the latest draft." }],
    },
  };
}

/** Record one rejection, falling back to the draft on the fourth in a row. */
async function rejection(
  input: RenderUIBlockInput,
  message: string,
): Promise<RenderUIBlockOutput> {
  const key = turnKey(input);
  const state = renderStateFor(key);
  state.rejected += 1;

  if (state.rejected < MAX_CONSECUTIVE_REJECTIONS) {
    return {
      success: false,
      error: message,
      data: { contentParts: [{ type: "input_text", text: message }] },
    };
  }

  return renderLastCandidate(input, state);
}

export async function executeRenderUIBlockTool(
  input: RenderUIBlockInput,
): Promise<RenderUIBlockOutput> {
  const key = turnKey(input);
  const state = renderStateFor(key);
  state.attempts += 1;

  // A turn renders one block (two at most, with a follow-up question). More
  // than that means the model is looping, whether or not the blocks pass.
  if (state.attempts > MAX_RENDER_ATTEMPTS) {
    return renderLastCandidate(input, state);
  }

  if (!input.args?.spec) {
    return rejection(
      input,
      "Error: Missing required 'spec' parameter for renderUIBlock.",
    );
  }

  try {
    const normalizedSpec = validateAndNormalizeUI(input.args.spec);
    if (!normalizedSpec) {
      throw new Error("UI specification resulted in an empty spec.");
    }

    // The same block resubmitted after it passed is a loop, not a new view.
    const specKey = JSON.stringify(normalizedSpec);
    if (state.lastSpec === specKey) {
      return {
        success: true,
        data: {
          spec: normalizedSpec,
          contentParts: [
            {
              type: "input_text",
              text: "This exact view is already on screen. Do not call renderUIBlock again; save it with the matching save tool or reply to the user.",
            },
          ],
        },
      };
    }

    // Every normalized draft is eligible for the fallback render.
    state.lastCandidate = normalizedSpec;

    // On the last allowed attempt, skip the judge and render the draft: the
    // user gets a real view instead of an apology loop.
    const finalAttempt = state.rejected + 1 >= MAX_CONSECUTIVE_REJECTIONS;
    if (!finalAttempt) {
      // The verdict goes back to the loop as the tool result, so the model can
      // retry with specific fixes.
      const verdict = await validateUIBlockFormat(
        normalizedSpec,
        input.context,
      );
      if (verdict !== null && !verdict.pass) {
        return rejection(input, formatRejection(verdict));
      }
    }

    if (input.context?.emitEvent) {
      await input.context.emitEvent({
        type: "ui/block",
        spec: normalizedSpec,
      });
    }

    state.lastSpec = specKey;
    state.rejected = 0;

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
    return rejection(input, `Error validating UI block: ${errorMsg}`);
  }
}
