/**
 * Workflow composition.
 *
 * The workflow bodies, dispatcher, and utilities live in
 * `@openai-harness/workflows`. This module binds the services those bodies
 * cannot own: the prompt compilers, the durable session loader, the canonical
 * tool registry, the live assistant stream, the skill pre-step, and the
 * business-profile connector lookup.
 *
 * @module @openai-harness/gateway/workflows
 */

import { resolvePresetTools } from "@openai-harness/agent-preset";
import { getConnectorRecordByUserIdAndSlug } from "@openai-harness/connector";
import { Session, SessionId } from "@openai-harness/session";
import { toolRegistry } from "@openai-harness/tools";
import { skillPreStepMiddleware } from "@openai-harness/tool-skill";
import {
  compileBusinessProfilePrompt,
  compileSystemPrompt,
  configureSystemPromptTools,
} from "@openai-harness/system-prompt";
import { configureWorkflows } from "@openai-harness/workflows";
import { publishAssistantStream } from "./buses";
import { guardPrompt } from "./guardrails";

// The prompt compiler renders each tool schema from the same registry the loop
// executes through, so every compile reports the tools that can run.
configureSystemPromptTools(toolRegistry);

/** Bind the deployment's services as the process-wide workflow host. */
export function configureWorkflowHost(): void {
  configureWorkflows({
    compileSystemPrompt,
    compileBusinessProfilePrompt,

    loadSession: (row, agentPreset) =>
      Session.load({
        version: 1,
        id: SessionId(row.id),
        userId: row.userId,
        createdAt: row.createdAt
          ? new Date(row.createdAt).getTime()
          : Date.now(),
        // The session slug is the agent-preset scope its tools and skills
        // resolve through. Carrying it on the header keeps pre-step and tool
        // dispatch aligned.
        ...(agentPreset !== undefined ? { agentPreset } : {}),
      }),

    resolvePresetTools: (slug) => resolvePresetTools(slug, toolRegistry),

    publishAssistantStream,

    guardPrompt,

    // The package sees the loop's structural session; the concrete object is
    // always this deployment's durable `Session`.
    preStep: (input) =>
      skillPreStepMiddleware({
        ...input,
        session: input.session as unknown as Session,
      }),

    businessProfileUrl: (userId) =>
      (getConnectorRecordByUserIdAndSlug(userId, "businessProfile")?.metadata as
        | { url?: string }
        | null
        | undefined)?.url,
  });
}

export {
  dispatcher,
  dispatchWorkflow,
  executeBusinessProfileWorkflow,
  executeMainWorkflow,
  type BusinessProfileWorkflowParams,
  type MainWorkflowParams,
  type MainWorkflowPrompt,
  type WorkflowCronJob,
  type WorkflowEvent,
  type WorkflowRunner,
  type WorkflowRunnerParams,
  type WorkflowSessionRow,
} from "@openai-harness/workflows";
