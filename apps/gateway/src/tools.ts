/**
 * Tool composition.
 *
 * Every product tool family is a Cordis plugin in its own package; this module
 * mounts them on the shared `tools` service (the same registry the rest of the
 * deployment reads) and binds the prerequisite gate every call passes through.
 * It also adapts the registry's execution result to the scheduler-facing shape
 * the agent loop uses.
 *
 * @module @openai-harness/gateway/tools
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ContentBlock } from "@openai-harness/llm";
import { ToolCallId } from "@openai-harness/llm";
import type { JsonValue } from "@openai-harness/util-values";
import * as toolAccount from "@openai-harness/tool-account";
import * as toolAudio from "@openai-harness/tool-audio";
import * as toolComposition from "@openai-harness/tool-composition";
import * as toolGenerativeUI from "@openai-harness/tool-generative-ui";
import * as toolImage from "@openai-harness/tool-image";
import * as toolMeta from "@openai-harness/tool-meta";
import * as toolSessionPackage from "@openai-harness/tool-session";
import * as toolShopify from "@openai-harness/tool-shopify";
import * as toolVideo from "@openai-harness/tool-video";
import * as toolWeb from "@openai-harness/tool-web";
import {
  ToolRuntime,
  toolHooks,
  toolRegistry,
  toolSession,
  type ToolDefinition,
  type ToolExecutionInput,
} from "@openai-harness/tools";
import type { Agent } from "@openai-harness/agent-loop";
import { evaluatePrerequisite } from "@openai-harness/skill";
import { debugEnd, debugStart } from "./debug";
import { registerToolGuardrails } from "./guardrails";
import { skillTool } from "./skills";

/** Cordis plugin name. */
export const name = "gateway:tools";

/**
 * Register every tool family, the skill tool, and the prerequisite gate.
 *
 * @param ctx - root context; mounts the `tools` service and the family plugins.
 */
export async function apply(ctx: Context): Promise<void> {
  registerToolGuardrails();
  bindPrerequisiteGate();
  await ctx.plugin(ToolRuntime, { registry: toolRegistry });
  for (const plugin of TOOL_PLUGINS) {
    await ctx.plugin(plugin);
  }
  // Read the service through `inject`: Cordis refuses a direct property access
  // on the plugin's own context for a service it did not declare.
  await ctx.inject(["tools"], (toolsCtx) => {
    toolsCtx.tools.register(skillTool);
  });
}

/** Tool-family plugins, one per package. */
const TOOL_PLUGINS = [
  toolGenerativeUI,
  toolImage,
  toolVideo,
  toolAudio,
  toolComposition,
  toolMeta,
  toolAccount,
  toolShopify,
  toolWeb,
  toolSessionPackage,
];

/**
 * Block a call whose prerequisite skill has not been fetched for the current
 * session. Registered on the shared hook set so it applies to every tool the
 * `tools` service exposes.
 */
function bindPrerequisiteGate(): void {
  toolHooks.usePreExecute(async (exec, next) => {
    const name = exec.name;
    const tool = toolRegistry.get(name);
    if (!tool) return next();

    const prereqFromDesc = tool.description?.match(
      /^Prerequisite:\s*(.*?)\s*skill(?:s)?\s*(?:is|are)\s*a\s*prerequisite/i,
    )?.[1]?.trim();
    const requiredPrereq = tool.prerequisiteSkill || prereqFromDesc;

    if (!requiredPrereq) return next();

    const session = toolSession<{ userId: string; id: string }>(exec);
    const prereqCheck = evaluatePrerequisite(
      {
        userId: session.userId,
        sessionId: session.id,
      },
      requiredPrereq,
      name,
    );

    if (prereqCheck.satisfied) return next();

    console.warn(
      `[Tool] Prerequisite '${Array.isArray(requiredPrereq) ? requiredPrereq.join(", ") : requiredPrereq}' not satisfied for tool '${name}'. Blocking execution.`,
    );
    return {
      kind: "deny",
      reason:
        prereqCheck.error ||
        prereqCheck.instruction ||
        "Prerequisite required before calling this tool.",
    };
  });
}

/** Signal for calls whose caller supplied none; never aborted. */
const NEVER_ABORTED = new AbortController().signal;

export interface ExecuteToolInput {
  /** Correlates this call with the model-issued tool call. */
  callId: ToolCallId | string;
  /** Parsed arguments. */
  args?: unknown;
  /** Caller-owned cancellation. */
  signal?: AbortSignal;
  /** Agent preset / session slug that scopes tool visibility. */
  scope?: string;
  /** The agent on whose behalf the call runs. */
  agent?: Agent;
}

export interface ExecuteToolOutput {
  success: boolean;
  data?: unknown;
  error?: string;
  content: ContentBlock[];
  value?: JsonValue;
  meta?: JsonValue;
  /** Context deferred by the tool body, for the agent loop to append. */
  additionalContexts?: import("@openai-harness/llm").UserMessage[];
  /** Whether the agent loop stops after committing this successful batch. */
  concludesTurn?: true;
}

/**
 * Thin adapter from the scheduler-facing call shape to one registry execution.
 *
 * It builds a {@link ToolExecutionInput} and delegates; the registry is the
 * only place the pipeline (hooks, guards, timeout, projection, observers)
 * runs, so no caller can bypass it.
 */
export async function executeTool(
  name: string,
  input: ExecuteToolInput,
): Promise<ExecuteToolOutput> {
  const startTime = Date.now();
  // One label keeps the trace readable: a skill fetch is a tool call whose
  // payload is instruction text, and it is the call most worth seeing.
  const label = name === skillTool.name ? "skill" : "tool";

  debugStart(
    label,
    name,
    `session ${input.agent?.session.id ?? "-"} call ${input.callId}`,
    input.args ?? {},
  );

  const exec: ToolExecutionInput = {
    callId: ToolCallId(input.callId),
    name,
    arguments: input.args ?? {},
    signal: input.signal ?? NEVER_ABORTED,
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
  };

  const result = await toolRegistry.execute(exec);
  const duration = Date.now() - startTime;

  if (!result.isError) {
    // The payload stays out of the terminal: a skill result is a whole
    // SKILL.md and a search result is thousands of ads.
    debugEnd(label, name, duration);
    return {
      success: true,
      data:
        result.content
          .map((c) => (c.type === "text" ? c.text : ""))
          .filter(Boolean)
          .join("\n\n") || result.value,
      content: result.content,
      value: result.value,
      ...(result.meta !== undefined ? { meta: result.meta } : {}),
      ...(result.additionalContexts !== undefined
        ? { additionalContexts: result.additionalContexts }
        : {}),
      ...(result.concludesTurn === true ? { concludesTurn: true } : {}),
    };
  }

  debugEnd(label, name, duration, result.error.message);
  return {
    success: false,
    error: result.error.message,
    content: result.content,
    ...(result.meta !== undefined ? { meta: result.meta } : {}),
    ...(result.additionalContexts !== undefined
      ? { additionalContexts: result.additionalContexts }
      : {}),
  };
}

export type { ToolDefinition };
