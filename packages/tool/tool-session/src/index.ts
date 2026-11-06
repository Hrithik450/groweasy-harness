/**
 * Model-facing session tool: reads the current conversation's message history
 * with role and timestamp-cursor filtering.
 *
 * The tool definition moved verbatim from `apps/gateway/src/lib/tools/session`;
 * its remaining `@/lib/...` imports are temporary application shims. This
 * package is a Cordis plugin: mount it with the `tools` service present and it
 * registers the tool on `ctx.tools`.
 *
 * @module @openai-harness/tool-session
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { fetchSessionMessagesTool } from "./fetch-session-messages/tool";

export * from "./fetch-session-messages/tool";

/** Cordis plugin name. */
export const name = "tool-session";

/** The tools service must exist before the family tool can register. */
export const inject = ["tools"];

/**
 * Register the session message tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(fetchSessionMessagesTool);
}
