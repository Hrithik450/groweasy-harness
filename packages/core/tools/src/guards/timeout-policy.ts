/**
 * Cooperative tool-call timeout enforcer ported from DeepSeek (@deepseek-ai/dsh-tool-call-timeout-policy).
 *
 * Enforces timeoutMs on tool execution using fused cancellation signals and
 * returns structured TOOL_TIMEOUT results instead of stalling.
 *
 * @module @openai-harness/tools/guards/timeout-policy
 */

import type { ToolExecutionResult } from "../types";

export const TOOL_TIMEOUT = "TOOL_TIMEOUT";

export class TimeoutReason extends Error {
  override name = "TimeoutReason";

  constructor(
    readonly code: string,
    readonly timeoutMs: number,
  ) {
    super(`${code} after ${timeoutMs}ms`);
  }
}

export interface Deadline {
  readonly signal: AbortSignal;
  dispose(): void;
  [Symbol.dispose](): void;
}

/**
 * Fuse upstream cancellation with an identifiable timeout.
 * timeoutMs <= 0 means "no timeout" (no timer armed).
 */
export function deadline(
  upstream: AbortSignal | undefined,
  timeoutMs: number,
  code: string = TOOL_TIMEOUT,
): Deadline {
  if (timeoutMs <= 0) {
    return {
      signal: upstream ?? new AbortController().signal,
      dispose() {},
      [Symbol.dispose]() {},
    };
  }

  const timer = new AbortController();
  const id = setTimeout(() => {
    timer.abort(new TimeoutReason(code, timeoutMs));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(id);
  };

  const signal =
    upstream !== undefined
      ? AbortSignal.any([upstream, timer.signal])
      : timer.signal;

  return {
    signal,
    dispose: cleanup,
    [Symbol.dispose]: cleanup,
  };
}

/**
 * Recover a timeout reason from an AbortSignal or caught error.
 */
export function timeoutOf(
  x: AbortSignal | { reason?: unknown } | unknown,
  code?: string,
): TimeoutReason | undefined {
  if (!x || typeof x !== "object") return undefined;
  const reason = "reason" in x ? (x as { reason?: unknown }).reason : x;
  if (!(reason instanceof TimeoutReason)) return undefined;
  return code === undefined || reason.code === code ? reason : undefined;
}

/**
 * The structured result substituted when the tool deadline fires.
 */
export function createTimeoutResult(
  timeoutMs: number,
  toolName?: string,
): ToolExecutionResult {
  const target = toolName ? `tool call "${toolName}"` : "tool call";
  const message = `${target} timed out after ${timeoutMs}ms`;
  return {
    isError: true,
    error: {
      message,
      info: { name: "ToolTimeoutError", code: TOOL_TIMEOUT },
      code: TOOL_TIMEOUT,
    },
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}
