/**
 * Workflow vocabulary: the session row a workflow accepts, the prompt shapes
 * it admits, and the events it publishes back to its caller.
 *
 * The durable `Session` class, persistence, and projection stay with the host;
 * this package only needs the structural fields the loop and the workflow
 * rules read.
 *
 * @module @openai-harness/workflows
 */

import type { AgentEvent } from "@openai-harness/agent";
import type { AgentSession } from "@openai-harness/agent-loop";
import type { UIBlockSpec } from "@openai-harness/generative-ui";
import type { ContentBlock, UserMessageSource } from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";

/**
 * Structural session row every workflow accepts.
 *
 * The application's Drizzle `Session` row satisfies this shape; keeping the
 * package on the structural subset is what lets workflows stay free of the
 * application's database module.
 */
export interface WorkflowSessionRow {
  readonly id: string;
  readonly userId: string;
  readonly title?: string | null;
  readonly slug?: string | null;
  readonly createdAt?: string | null;
}

/**
 * Host-side durable session domain object the loop drives.
 *
 * Extends the loop's structural view with the host's live event subscription,
 * which the business-profile workflow uses to translate durable events into
 * its caller's `onEvent` stream.
 */
export interface WorkflowSession extends AgentSession {
  onEvent(listener: (event: SessionEvent) => void | Promise<void>): () => void;
}

/** Every event a workflow publishes to its caller. */
export type WorkflowEvent = AgentEvent;

/** Session cron job types the dispatcher routes. Mirrors the host catalog. */
export type WorkflowCronJob =
  | "adManager/alerts"
  | "adManager/suggestions"
  | "adManager/campaigns"
  | "businessProfile/update"
  | "adStrategist/marketWinners"
  | "adStrategist/reports"
  | "adManager/accountWinners";

/** One prompt admitted into the agent inbox before the turn starts. */
export interface MainWorkflowPrompt {
  /** Durable identity of the user message the turn claims. */
  id: string;
  content: ContentBlock[];
  /** `user-rpc` for typed prompts, `ui-action` for rendered-block input. */
  source: UserMessageSource;
}

export interface MainWorkflowParams<
  R extends WorkflowSessionRow = WorkflowSessionRow,
> {
  session: R;
  prompt: MainWorkflowPrompt;
  /**
   * Submitted interactive block: its updated spec is committed as a
   * replacement `ui/block` event before the turn starts, so the surface keeps
   * the user's interaction state.
   */
  block?: {
    id: string;
    spec: UIBlockSpec;
  };
  signal?: AbortSignal;
}

export interface BusinessProfileWorkflowParams<
  R extends WorkflowSessionRow = WorkflowSessionRow,
> {
  session: R;
  brandUrl: string;
  input?: string;
  onEvent?: (event: WorkflowEvent) => void | Promise<void>;
  /** Cancellation of the caller that started this run. */
  signal?: AbortSignal;
}

export interface WorkflowRunnerParams {
  session: WorkflowSessionRow;
  prompt: string;
  onEvent?: (event: WorkflowEvent) => void | Promise<void>;
}

export type WorkflowRunner = (params: WorkflowRunnerParams) => Promise<void>;
