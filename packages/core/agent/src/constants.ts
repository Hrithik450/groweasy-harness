/**
 * Agent execution defaults shared by callers and orchestration layers.
 *
 * @module @openai-harness/agent
 */

/** Default cap on tool calls dispatched concurrently within one step. */
export const DEFAULT_MAX_PARALLEL_TOOL_CALLS = 8;

/** Default per-tool execution timeout, in milliseconds. */
export const DEFAULT_TOOL_TIMEOUT_MS = 60_000;
