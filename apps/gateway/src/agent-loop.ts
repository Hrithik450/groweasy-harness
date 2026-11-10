/**
 * Agent-loop composition.
 *
 * Turn ordering, the durable inbox, assistant framing, and tool-call
 * scheduling are owned by `@openai-harness/agent-loop`. The loop reaches this
 * deployment only through its `AgentLoopHost`; this module binds that host to
 * the model-driver resolution, chat derivation, compaction engine, and tool
 * registry composed beside it.
 *
 * @module @openai-harness/gateway/agent-loop
 */

import {
  configureAgentLoop,
  type Agent,
  type AgentLoopHost,
  type StepCompaction,
} from "@openai-harness/agent-loop";
import { toChatMessages } from "@openai-harness/session-projection";
import { toolRegistry, type ToolExecutionInput } from "@openai-harness/tools";
import type { Session } from "@openai-harness/session";
import { CompactionEngine } from "./compaction";
import {
  getDefaultModel,
  getProviderName,
  resolveModelDriver,
} from "./llm";
import { guardAnswer } from "./guardrails";
import { executeTool } from "./tools";

let defaultCompactionEngine: CompactionEngine | null | undefined;

/**
 * Lazily construct the process-wide automatic compaction engine. A malformed
 * environment configuration disables compaction instead of failing model steps.
 */
function resolveCompactionEngine(): CompactionEngine | null {
  if (defaultCompactionEngine !== undefined) return defaultCompactionEngine;

  try {
    defaultCompactionEngine = new CompactionEngine();
  } catch (error: unknown) {
    defaultCompactionEngine = null;
    console.warn(
      `[compaction] automatic compaction disabled: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return defaultCompactionEngine;
}

/** Adapt the concrete engine's `Session` parameter to the loop's seam. */
function resolveCompaction(): StepCompaction | null {
  const engine = resolveCompactionEngine();
  if (!engine) return null;
  return {
    config: engine.config,
    maybeCompact: (session, driver, signal) =>
      engine.maybeCompact(session as Session, driver, signal),
  };
}

const host: AgentLoopHost = {
  resolveDriver: resolveModelDriver,
  provider: getProviderName,
  model: getDefaultModel,
  // The second argument is the compiled system prompt. Forwarding it is what
  // puts the rules, the UI-block protocol, and the component catalog in front
  // of the model; dropping it silently ships a bare transcript.
  deriveMessages: (events, instructions) =>
    toChatMessages(events, instructions),
  // The live stream is already out by the time this runs, so the prompt stays
  // the first line of defense; this keeps the durable transcript — and every
  // reload of it — free of credentials, identity claims, PII, unsafe markup,
  // and leaked system-prompt markers.
  guardAnswer: ({ text, session }) => guardAnswer(text, session),
  compaction: resolveCompaction,
  executionMode: (input) =>
    toolRegistry.executionMode(input as unknown as ToolExecutionInput),
  executeTool: (name, input) =>
    executeTool(name, {
      ...input,
      // The loop sees the structural agent session; the concrete object is
      // always this deployment's `Session`.
      agent: input.agent as unknown as Agent,
    }),
};

/** Bind the deployment's services as the process-wide loop host. */
export function configureAgentLoopHost(): void {
  configureAgentLoop(host);
}
