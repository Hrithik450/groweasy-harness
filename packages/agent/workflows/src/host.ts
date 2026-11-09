/**
 * The workflow host seam.
 *
 * Workflows orchestrate a turn but cannot own the application's prompt
 * compilers, durable session loading, tool registry, live assistant stream,
 * skill pre-step, or connector lookup. The host supplies exactly those through
 * {@link WorkflowHost}; bind them once with {@link configureWorkflows}.
 *
 * This mirrors the application's other host seams (`configureAgentLoop`,
 * `configureScheduleStore`): package code never imports an application alias.
 *
 * @module @openai-harness/workflows
 */

import type { AssistantStreamFrame, PreStepHook } from "@openai-harness/agent-loop";
import type {
  MainWorkflowPrompt,
  WorkflowSession,
  WorkflowSessionRow,
} from "./types";

/** Everything a workflow cannot own itself. */
export interface WorkflowHost {
  /** Compile the main agent instructions for a session title. */
  compileSystemPrompt(title?: string | null): string;
  /** Compile the business-profile instructions for a brand URL. */
  compileBusinessProfilePrompt(brandUrl: string): string;
  /**
   * Load the durable session domain object and repair interrupted turns.
   * @param row - the host session row the workflow was invoked with.
   * @param agentPreset - slug to record on the session header, when the
   *   workflow is preset-scoped.
   */
  loadSession(
    row: WorkflowSessionRow,
    agentPreset?: string,
  ): Promise<WorkflowSession>;
  /** Expand a session slug into the tool definitions the loop receives. */
  resolvePresetTools(slug: string | null | undefined): readonly unknown[];
  /** Publish one live assistant frame to the process-wide followers. */
  publishAssistantStream(
    sessionId: string,
    frame: AssistantStreamFrame,
  ): void;
  /**
   * Optional admission guard for every prompt a workflow receives, including
   * cron prompts. Returns the prompt to run, with text already bounded.
   */
  guardPrompt?(prompt: MainWorkflowPrompt): MainWorkflowPrompt;
  /** Optional durable pre-step context (skill catalog and invocations). */
  preStep?: PreStepHook<WorkflowSession>;
  /** Read the business-profile website URL for a user, if connected. */
  businessProfileUrl(userId: string): string | undefined;
}

let configuredHost: WorkflowHost | undefined;

/**
 * Bind the application services workflows reach through.
 * @param host - the host implementation; later calls replace it.
 */
export function configureWorkflows(host: WorkflowHost): void {
  configuredHost = host;
}

/**
 * Read the bound workflow host.
 * @returns the process-wide host.
 * @throws when no host has been configured yet.
 */
export function getWorkflowHost(): WorkflowHost {
  if (configuredHost === undefined) {
    throw new Error(
      "[workflows] no host configured — call configureWorkflows() at application boot",
    );
  }
  return configuredHost;
}
