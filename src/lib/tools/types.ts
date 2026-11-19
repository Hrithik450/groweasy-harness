import type { SessionId } from "@/lib/core/agent/session-types";
import type { Event } from "@/lib/core/agent/types";
import type { ContentBlock, ToolCallId, UserMessage } from "@/lib/llm/llm";
import type { JsonValue } from "@/lib/utils/values";
import type { UIBlockSpec } from "@/lib/generative.ui";
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

export interface ToolRunContext {
  callId?: ToolCallId | string;
  name?: string;
  arguments?: unknown;
  signal?: AbortSignal;
  userId?: string;
  sessionId?: SessionId | string;
  /** Assistant message that requested this call. */
  turnId?: string;
  emitEvent?: (event: Event) => void | Promise<void>;
  deferContext?: (context: UserMessage | unknown) => void;
  concludeTurn?: () => void;
}

export interface ToolSchema {
  readonly type?: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  deferLoading?: boolean;
  timeoutMs?: number;
  preSkills?: string | string[];
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition extends ToolSchema {
  readonly category?: string;
  readonly metadata?: Record<string, unknown>;
  /** Mandatory canonical output declaration. */
  readonly output: ToolOutputDefinition;

  /**
   * Run one accepted call and return only its canonical lossless-JSON value.
   */
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>;

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

export interface ToolExecutionSuccess {
  readonly isError: false;
  readonly value: JsonValue;
  readonly content: ContentBlock[];
  readonly meta?: JsonValue;
  readonly concludesTurn?: boolean;
}

export interface ToolExecutionFailure {
  readonly isError: true;
  readonly error: ToolFailure;
  readonly content: ContentBlock[];
  readonly meta?: JsonValue;
  readonly value?: never;
  readonly concludesTurn?: never;
}

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

/** A live emission from a tool; the host persists it as a `ui/block` event. */
export type ToolEvent = { type: "ui/block"; spec: UIBlockSpec };

/** Arguments plus caller identity for one tool execution. */
export interface ToolInput<TArgs = Record<string, unknown>> {
  args: TArgs;
  context?: {
    userId?: string;
    sessionId?: string;
    /** Assistant message that requested this call. */
    turnId?: string;
    emitEvent?: (event: ToolEvent) => void | Promise<void>;
  };
}

/** Uniform tool result: success flag, typed payload, readable failure. */
export interface ToolOutput<TData = Record<string, unknown>> {
  success: boolean;
  data?: TData;
  error?: string;
}
