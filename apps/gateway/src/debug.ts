/**
 * Development-only tracing for the gateway wiring.
 *
 * Tools and skills are the harness's blind spot in a terminal: the model sees
 * their results, the operator sees nothing. In development (`NODE_ENV !==
 * "production"`) every call prints a three-line start record — what ran, for
 * which session, with which arguments — and one completion line. The payload
 * itself never reaches the terminal: a skill result is an entire SKILL.md and
 * a search result is thousands of ads, and printing either buries the trace.
 * Production stays silent.
 *
 * @module @openai-harness/gateway/debug
 */

/** True unless the process is explicitly running as production. */
export const DEV_LOGS: boolean = process.env.NODE_ENV !== "production";

/** Longest argument preview printed on one line. */
export const LOG_PREVIEW_CHARS = 240;

/**
 * Print one development trace line.
 * @param message - short description of what is happening.
 * @param detail - optional structured context; printed verbatim.
 */
export function debugLog(message: string, detail?: unknown): void {
  if (!DEV_LOGS) return;
  if (detail === undefined) console.log(`[dev] ${message}`);
  else console.log(`[dev] ${message}`, detail);
}

/**
 * Print the three-line start record for one tool or skill call.
 * @param label - `tool` or `skill`.
 * @param name - the tool name being called.
 * @param context - session and call identifiers, already formatted.
 * @param args - the arguments to summarize; never printed in full.
 */
export function debugStart(
  label: string,
  name: string,
  context: string,
  args: unknown,
): void {
  if (!DEV_LOGS) return;
  console.log(`[dev] ${label} call: ${name}`);
  console.log(`[dev]   ${context}`);
  console.log(`[dev]   args: ${preview(args)}`);
}

/**
 * Print the one-line completion record for one tool or skill call.
 * @param label - `tool` or `skill`.
 * @param name - the tool name that ran.
 * @param ms - how long it took.
 * @param failure - the error message when the call failed.
 */
export function debugEnd(
  label: string,
  name: string,
  ms: number,
  failure?: string,
): void {
  if (!DEV_LOGS) return;
  const outcome = failure === undefined ? "done" : `failed: ${failure}`;
  console.log(`[dev] ${label} ${outcome} (${name}, ${ms}ms)`);
}

/**
 * Render one value on a single log line without throwing on cycles.
 * @param value - anything a tool received or returned.
 * @returns compact JSON, collapsed to one line and truncated to
 * {@link LOG_PREVIEW_CHARS}.
 */
export function preview(value: unknown): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > LOG_PREVIEW_CHARS
    ? `${flat.slice(0, LOG_PREVIEW_CHARS)}… (${flat.length} chars)`
    : flat;
}
