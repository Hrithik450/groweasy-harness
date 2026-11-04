import type { Agent } from "@openai-harness/agent-loop";
import type { ContentBlock, UserMessage } from "@openai-harness/llm";
import type { JsonValue } from "@openai-harness/util-values";
import type { ToolCallId } from "@openai-harness/llm";
import type { JsonSchemaNode } from "./json-schema";
import type { ToolCallView, ToolResultView } from "./presentation";

/**
 * Tool-owned canonical output contract used after the body returns a JSON value.
 */
export interface ToolOutputDefinition {
  /** Raw supported JSON Schema enforced against every successful canonical value. */
  readonly schema: JsonSchemaNode;
  /** Pure projection from validated arguments and value to model content blocks. */
  render(args: unknown, value: JsonValue): ContentBlock[];
  /** Pure replayable presentation projection for native and nested calls. */
  presentationMeta?(args: unknown, value: JsonValue): JsonValue;
}

/**
 * The completed outcome handed to ToolDefinition.presentResult.
 */
export interface ToolResult {
  /** The final model-facing content (or the rendered error text on failure). */
  content: ContentBlock[];
  /** Whether the call failed. */
  isError: boolean;
  /**
   * The tool-private presentation payload projected by its output declaration.
   */
  meta?: JsonValue;
}

/**
 * Structured error metadata for a failed tool call.
 */
export interface ToolErrorInfo {
  name: string;
  code: string;
  reason?: string;
}

export interface ToolFailure {
  message: string;
  info?: ToolErrorInfo;
  code?: string;
}

/**
 * Thrown when arguments fail validation against parameter schema.
 */
export class ToolArgsError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`invalid tool arguments: ${violations.join("; ")}`);
    this.name = "ToolArgsError";
    this.violations = violations;
  }
}

/**
 * Thrown (internally) when a call names a tool that is not visible to its
 * scope. The canonical code lets retry/replay/telemetry distinguish an
 * unknown-tool denial from a failure owned by a tool body.
 */
export class ToolNotFoundError extends Error {
  readonly code = "UNKNOWN_TOOL";

  constructor(toolName: string) {
    super(`unknown tool "${toolName}"`);
    this.name = "ToolNotFoundError";
  }
}

/**
 * Caller-supplied description of one tool call. The registry accepts this
 * description and runs it through the single flat pipeline.
 */
export interface ToolExecutionInput {
  /** Correlates this execution with the model-issued tool call. */
  readonly callId: ToolCallId;
  readonly name: string;
  /** Parsed arguments (tools validate their own schema). */
  readonly arguments: unknown;
  /** The agent on whose behalf the call runs (set by the agent loop). */
  readonly agent?: Agent;
  /** Required caller-owned cancellation for this invocation. */
  readonly signal: AbortSignal;
  /**
   * Registry view scope for this call (an agent preset or session slug).
   * Omitted falls back to the calling agent's preset, then the global view.
   * Monolith extension: dsh derives this from the scoped context.
   */
  readonly scope?: string;
}

/**
 * Scheduling mode for one pending call. `parallel` may overlap with siblings;
 * `exclusive` runs alone and forms an ordering barrier.
 */
export type ToolExecutionMode = { kind: "parallel" } | { kind: "exclusive" };

/**
 * One pending tool call inside the registry pipeline. A flat execution carries
 * exactly the caller-supplied identity, name, arguments, and cancellation.
 */
export type ToolExecution = ToolExecutionInput;

/**
 * Runtime context handed to a tool implementation after the registry accepted
 * a {@link ToolExecution}. Context deferred here rides this execution's own
 * result; the loop appends it only after the `tool/result`.
 */
export interface ToolRunContext extends ToolExecution {
  /**
   * Defer one context — such as a fresh plugin-sourced instruction — until
   * this tool's final result reaches the agent loop. Contexts retain their
   * individual source and metadata and are emitted in call order.
   */
  deferContext(context: UserMessage): void;
  /**
   * Mark a successful final result as terminal for the current agent turn.
   * The marker rides only a success result, so only a successful tool can
   * conclude the run.
   */
  concludeTurn(): void;
}

export interface ToolSchema {
  readonly type?: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  deferLoading?: boolean;
  timeoutMs?: number;
  prerequisiteSkill?: string | string[];
}

export interface ToolDefinition extends ToolSchema {
  /** Mandatory canonical output declaration. */
  readonly output: ToolOutputDefinition;

  /**
   * Run one accepted call and return only its canonical lossless-JSON value.
   * Async work must observe or forward `exec.signal` and settle only after its
   * owned work reaches quiescence.
   */
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>;

  /**
   * Install execution-prepared content before post-execute policies. The
   * callback is captured when the call starts and runs once for a normalized
   * outcome entering post-execute. Policy replacements remain authoritative.
   */
  projectContent?(
    exec: Readonly<ToolExecution>,
    result: Readonly<ToolExecutionResult>,
  ): ContentBlock[] | undefined;

  /**
   * Synchronous last-mile transform for model-facing content. The registry
   * snapshots this callback when execution starts and invokes it exactly once
   * for every normalized outcome, including pipeline failures, immediately
   * before result materialization. Returning `undefined` preserves the
   * content; every other result field remains registry-owned.
   */
  finalizeContent?(
    exec: Readonly<ToolExecution>,
    result: Readonly<ToolExecutionResult>,
  ): ContentBlock[] | undefined;

  /** Optional synchronous classifier for sibling tool call concurrency. */
  isConcurrencySafe?(args: unknown): boolean;

  /**
   * Optional pending-state UI presenter.
   */
  presentCall?(args: unknown): ToolCallView | undefined;

  /**
   * Optional completed-state UI presenter.
   */
  presentResult?(args: unknown, result: ToolResult): ToolResultView | undefined;
}

/** Successful canonical tool execution, including its model projection. */
export interface ToolExecutionSuccess {
  readonly isError: false;
  /** Execution-local canonical value; deliberately omitted from durable events. */
  readonly value: JsonValue;
  readonly content: ContentBlock[];
  readonly error?: never;
  readonly meta?: JsonValue;
  /** Context ferried to the agent loop after this result is committed. */
  readonly additionalContexts?: UserMessage[];
  /** The agent loop stops after committing this successful result batch. */
  readonly concludesTurn?: true;
}

/** Failed canonical tool execution; failures never carry a successful value. */
export interface ToolExecutionFailure {
  readonly isError: true;
  readonly error: ToolFailure;
  readonly value?: never;
  readonly content: ContentBlock[];
  readonly meta?: JsonValue;
  /** Context ferried to the agent loop after this result is committed. */
  readonly additionalContexts?: UserMessage[];
  readonly concludesTurn?: never;
}

/** The discriminated, execution-local outcome of one tool call. */
export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure;

export interface OpenAIFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function toOpenAITool(
  tool: ToolDefinition | ToolSchema,
): OpenAIFunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

export function toOpenAITools(
  tools: Array<ToolDefinition | ToolSchema>,
): OpenAIFunctionTool[] {
  return tools.map(toOpenAITool);
}
