/**
 * Host-owned services for the agent loop.
 *
 * The loop owns turn/step ordering, the durable inbox, assistant attempt
 * framing, and tool-call scheduling. Everything that touches the application —
 * provider selection, the model driver, chat derivation, the compaction engine,
 * and the tool registry — is supplied by the host through an
 * {@link AgentLoopHost}, so this package imports no application aliases and no
 * framework code.
 *
 * This mirrors the `SessionEventsStore` seam in `@openai-harness/session-
 * persistence`: a host binds its services once with {@link configureAgentLoop}
 * and later steps resolve them lazily, or a caller passes an explicit `host`
 * for a single invocation.
 *
 * @module @openai-harness/agent-loop
 */

import type {
  ContentBlock,
  Message,
  ModelDriver,
  ToolCallId,
  UserMessage,
} from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";
import type { Agent, AgentSession } from "./agent-types";

/** Scheduling mode for one pending tool call. */
export type ToolExecutionMode = { kind: "parallel" } | { kind: "exclusive" };

/**
 * One pending tool call handed to the host's scheduler queries.
 *
 * Structurally compatible with the application registry's
 * `ToolExecutionInput`, which stays in the app.
 */
export interface ToolExecutionInput {
  /** Correlates this execution with the model-issued tool call. */
  readonly callId: ToolCallId;
  readonly name: string;
  /** Parsed arguments (tools validate their own schema). */
  readonly arguments: unknown;
  /** The agent on whose behalf the call runs. */
  readonly agent?: Agent;
  /** Caller-owned cancellation for this invocation. */
  readonly signal: AbortSignal;
  /** Registry view scope for this call. */
  readonly scope?: string;
}

/** One tool invocation handed to `executeTool`. */
export interface ToolExecutionRequest {
  readonly callId: ToolCallId;
  readonly args?: unknown;
  readonly signal?: AbortSignal;
  readonly scope?: string;
  readonly agent?: Agent;
}

/** Normalized result of one tool execution. */
export interface ExecuteToolOutput {
  success: boolean;
  data?: unknown;
  error?: string;
  content: ContentBlock[];
  /** Context the tool deferred; the loop appends it after its result. */
  additionalContexts?: UserMessage[];
  /** Whether the loop stops after committing this successful batch. */
  concludesTurn?: true;
}

/** Automatic-compaction surface the driver consults once per step. */
export interface StepCompaction {
  readonly config: { readonly auto?: boolean };
  maybeCompact(
    session: AgentSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

/** One final assistant answer, as the loop is about to persist it. */
export interface AnswerGuardInput {
  /** The accumulated assistant text for this step. */
  readonly text: string;
  /** The agent's structural session view. */
  readonly session: AgentSession;
  readonly turn: number;
  readonly step: number;
}

/**
 * Final-answer guard. Returns the text to persist, or `undefined` to keep the
 * model's own text. Runs after the stream has completed and before the durable
 * `assistant/message` is appended, so a host can redact what it persists
 * without changing what was already streamed.
 */
export type AnswerGuard = (input: AnswerGuardInput) => string | undefined;

/**
 * Everything the loop needs from its host runtime.
 */
export interface AgentLoopHost {
  /** Resolve the model driver for a step. */
  resolveDriver(): ModelDriver;
  /** Provider recorded on the request header and assistant source. */
  provider(): string;
  /** Model recorded on the request header and assistant source. */
  model(): string;
  /** Project the durable log into the model-visible conversation. */
  deriveMessages(
    events: readonly SessionEvent[],
    instructions?: string,
  ): Message[];
  /** Automatic compaction engine, or null when the host disabled it. */
  compaction?(): StepCompaction | null;
  /** Rewrite the final answer before it is appended to the durable log. */
  guardAnswer?: AnswerGuard;
  /** Live concurrency classification for one tool call. */
  executionMode(input: ToolExecutionInput): ToolExecutionMode;
  /** Run one tool call through the host's registry. */
  executeTool(
    name: string,
    input: ToolExecutionRequest,
  ): Promise<ExecuteToolOutput>;
}

/** Host bound by {@link configureAgentLoop}, if any. */
let defaultHost: AgentLoopHost | undefined;

/**
 * Bind the host application's runtime as the default for every step and tool
 * batch that does not receive an explicit host.
 *
 * @param host - the host's driver, derivation, compaction, and tool services.
 */
export function configureAgentLoop(host: AgentLoopHost): void {
  defaultHost = host;
}

/**
 * Resolves the configured default host or explains why there is none.
 */
export function requireAgentLoopHost(): AgentLoopHost {
  if (!defaultHost) {
    throw new Error(
      "Agent loop has no host: pass `host` to runStep/executeToolCalls or call configureAgentLoop() during host composition.",
    );
  }
  return defaultHost;
}
