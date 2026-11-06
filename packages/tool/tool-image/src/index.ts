/**
 * Model-facing image tools: marketing visual generation, image inspection,
 * and calibrated static-ad prompt lookup.
 *
 * The tool definitions and their shared `utils.ts` prompt catalog moved
 * verbatim from `apps/gateway/src/lib/tools/image`; their remaining
 * `@/lib/...` imports are temporary application shims. This package is a
 * Cordis plugin: mount it with the `tools` service present and it registers
 * every family tool on `ctx.tools`.
 *
 * @module @openai-harness/tool-image
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { fetchImageTypesTool } from "./fetch-image-types/tool";
import { generateImagesTool } from "./generate-images/tool";
import { readImagesTool } from "./read-images/tool";

export * from "./fetch-image-types/tool";
export * from "./generate-images/tool";
export * from "./read-images/tool";
export * from "./utils";

/** Cordis plugin name. */
export const name = "tool-image";

/** The tools service must exist before the family tools can register. */
export const inject = ["tools"];

/**
 * Register every image tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(fetchImageTypesTool);
  ctx.tools.register(generateImagesTool);
  ctx.tools.register(readImagesTool);
}
