/**
 * Development-only tracing for the agent loop.
 *
 * The loop runs on the request hot path, so everything here is gated behind a
 * single module-level check: production builds print nothing, and a
 * development server (`NODE_ENV !== "production"`) traces every model request,
 * abort, and step outcome to the terminal. Nothing here may carry prompt or
 * tool content that is not already model-facing.
 *
 * @module @openai-harness/agent-loop/debug
 */

/** True unless the process is explicitly running as production. */
export const DEV_LOGS: boolean = process.env.NODE_ENV !== "production";

/**
 * Print one development trace line.
 * @param message - short description of what is happening.
 * @param detail - optional structured context.
 */
export function debugLog(message: string, detail?: unknown): void {
  if (!DEV_LOGS) return;
  if (detail === undefined) console.log(`[agent] ${message}`);
  else console.log(`[agent] ${message}`, detail);
}
