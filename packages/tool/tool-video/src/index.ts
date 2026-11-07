/**
 * Model-facing video tools: subtitle compilation, AI image-to-video motion,
 * lip synchronization, and video inspection.
 *
 * The tool definitions moved verbatim from
 * `apps/gateway/src/lib/tools/video`; their remaining `@/lib/...` imports are
 * temporary application shims. This package is a Cordis plugin: mount it with
 * the `tools` service present and it registers every family tool on
 * `ctx.tools`.
 *
 * @module @openai-harness/tool-video
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { createSubtitlesTool } from "./create-subtitles/tool";
import { imageToVideoTool } from "./image-to-video/tool";
import { readVideosTool } from "./read-videos/tool";
import { syncLipsTool } from "./sync-lips/tool";

export * from "./create-subtitles/tool";
export * from "./image-to-video/tool";
export * from "./read-videos/tool";
export * from "./sync-lips/tool";

/** Cordis plugin name. */
export const name = "tool-video";

/** The tools service must exist before the family tools can register. */
export const inject = ["tools"];

/**
 * Register every video tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(createSubtitlesTool);
  ctx.tools.register(imageToVideoTool);
  ctx.tools.register(syncLipsTool);
  ctx.tools.register(readVideosTool);
}
