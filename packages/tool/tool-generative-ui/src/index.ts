/**
 * Model-facing Generative UI tool: validates a nested component tree spec and
 * appends it to the calling session for the chat renderer.
 *
 * The tool definition moved verbatim from
 * `apps/gateway/src/lib/tools/generative-ui`; its remaining `@/lib/...`
 * imports are temporary application shims. This package is a Cordis plugin:
 * mount it with the `tools` service present and it registers the tool on
 * `ctx.tools`.
 *
 * @module @openai-harness/tool-generative-ui
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { renderUIBlockTool } from "./render-ui-block/tool";

export * from "./render-ui-block/tool";

/** Cordis plugin name. */
export const name = "tool-generative-ui";

/** The tools service must exist before the family tool can register. */
export const inject = ["tools"];

/**
 * Register the Generative UI tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(renderUIBlockTool);
}
