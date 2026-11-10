/**
 * Guardrail composition.
 *
 * The checks live in `@openai-harness/guardrails`; this module is the one place
 * the deployment decides which of them run, with what limits, and on which
 * seam. Everything else (tools, agent loop, workflow admission) calls the
 * functions here, so adding a control never means editing four call sites.
 *
 * Intervention points map one-to-one to the seams OWASP, Azure Prompt Shields,
 * and NeMo Guardrails recommend:
 *
 * | Surface | Seam | Examples enforced |
 * |---|---|---|
 * | prompt | workflow admission | input cap, injection detection |
 * | tool call | `tools/pre-execute` | deny list, argument cap, SSRF, quotas |
 * | tool result | `tools/post-execute` | secrets, indirect injection, spotlighting |
 * | answer | `AgentLoopHost.guardAnswer` | identity, secrets, PII, markup, prompt leak |
 *
 * @module @openai-harness/gateway/guardrails
 */

import {
  Guardrails,
  type GuardFinding,
  type GuardrailOptions,
} from "@openai-harness/guardrails";
import type { AgentSession } from "@openai-harness/agent-loop";
import type { ContentBlock } from "@openai-harness/llm";
import { toolHooks } from "@openai-harness/tools";
import type { MainWorkflowPrompt } from "@openai-harness/workflows";
import { debugLog, preview } from "./debug";

/** Read a positive integer override, falling back to the policy default. */
function readInt(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Read the answer-PII mode. */
function readPiiMode(): "high" | "all" | "off" | undefined {
  const raw = process.env.GUARDRAILS_PII?.trim().toLowerCase();
  return raw === "high" || raw === "all" || raw === "off" ? raw : undefined;
}

/** Read a comma-separated tool deny list. */
function readDenyTools(): string[] | undefined {
  const raw = process.env.GUARDRAILS_DENY_TOOLS?.trim();
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Deployment policy, overridable through environment variables. */
export const guardrails = new Guardrails({
  ...(readInt("GUARDRAILS_MAX_INPUT_CHARS") !== undefined
    ? { maxInputChars: readInt("GUARDRAILS_MAX_INPUT_CHARS")! }
    : {}),
  ...(readInt("GUARDRAILS_TOOL_CALLS_PER_MINUTE") !== undefined
    ? { toolCallsPerMinute: readInt("GUARDRAILS_TOOL_CALLS_PER_MINUTE")! }
    : {}),
  ...(readInt("GUARDRAILS_GENERATION_CALLS_PER_MINUTE") !== undefined
    ? {
        generationCallsPerMinute: readInt(
          "GUARDRAILS_GENERATION_CALLS_PER_MINUTE",
        )!,
      }
    : {}),
  ...(readDenyTools() !== undefined ? { denyTools: readDenyTools()! } : {}),
  ...(readPiiMode() !== undefined ? { piiInAnswers: readPiiMode()! } : {}),
  ...(process.env.GUARDRAILS_ALLOW_PRIVATE_HOSTS === "1"
    ? { allowPrivateHosts: true }
    : {}),
} satisfies GuardrailOptions);

/** Log findings by name and count; never log the matched text itself. */
function report(
  surface: string,
  findings: readonly GuardFinding[],
  extra: Record<string, unknown> = {},
): void {
  if (findings.length === 0) return;
  console.warn(`[guardrails] ${surface}`, {
    checks: [...new Set(findings.map((finding) => finding.check))],
    count: findings.length,
    ...extra,
  });
}

/**
 * Guard one admitted prompt before the workflow starts its turn.
 *
 * @param prompt - the admitted prompt.
 * @returns the prompt with text under the input cap.
 */
export function guardPrompt(prompt: MainWorkflowPrompt): MainWorkflowPrompt {
  const inspected = guardrails.inspectPromptBlocks(prompt.content);
  debugLog(`prompt admitted (${prompt.source.kind})`, {
    promptId: prompt.id,
    content: preview(prompt.content),
  });
  report("prompt", inspected.findings, {
    truncated: inspected.truncated,
    promptId: prompt.id,
  });
  return {
    ...prompt,
    content: [...inspected.blocks] as ContentBlock[],
  };
}

/**
 * Guard the final answer before the loop persists it.
 *
 * @param text - the assistant's answer.
 * @param session - the owning session, for logging.
 * @returns the text to persist.
 */
export function guardAnswer(text: string, session: AgentSession): string {
  const inspected = guardrails.inspectAnswer(text);
  report("answer", inspected.findings, {
    sessionId: session.id,
    blocked: inspected.blocked,
  });
  return inspected.text;
}

/**
 * Bind the tool-call and tool-result surfaces on the shared hook set.
 *
 * The hooks are registered once during tool composition and then apply to every
 * registry execution, including workflow- and cron-driven calls.
 */
export function registerToolGuardrails(): void {
  toolHooks.usePreExecute(async (exec, next) => {
    const sessionId = exec.agent?.session.id;
    const verdict = guardrails.inspectToolCall(
      exec.name,
      exec.arguments,
      sessionId,
    );
    if (verdict.kind === "allow") return next();

    report(
      "tool-call",
      [
        {
          check: verdict.check,
          start: 0,
          end: 0,
          replacement: "",
          detail: verdict.reason,
        },
      ],
      { sessionId, tool: exec.name },
    );
    return { kind: "deny", reason: verdict.reason };
  });

  toolHooks.usePostExecute(async (exec, result, next) => {
    const downstream = await next();
    // A later hook that replaced the canonical value re-renders its own
    // content, and a block replaces it with feedback; neither is ours to edit.
    if (downstream.kind !== "accept" || downstream.value !== undefined) {
      return downstream;
    }

    const inspected = guardrails.inspectToolResult(
      exec.name,
      downstream.content ?? result.content,
    );
    report("tool-result", inspected.findings, {
      sessionId: exec.agent?.session.id,
      tool: exec.name,
    });
    if (inspected.blocks === (downstream.content ?? result.content)) {
      return downstream;
    }
    return {
      kind: "accept",
      content: [...inspected.blocks] as ContentBlock[],
      ...(downstream.additionalContexts !== undefined
        ? { additionalContexts: downstream.additionalContexts }
        : {}),
    };
  });
}
