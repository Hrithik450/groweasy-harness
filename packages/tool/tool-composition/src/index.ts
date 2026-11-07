/**
 * Model-facing composition tools: universal FFmpeg execution, SVG element
 * rendering, overlay-template lookup, and durable asset saving.
 *
 * The tool definitions and their family utilities moved verbatim from
 * `apps/gateway/src/lib/tools/composition`; their remaining `@/lib/...`
 * imports are temporary application shims. This package is a Cordis plugin:
 * mount it with the `tools` service present and it registers every family tool
 * on `ctx.tools`.
 *
 * @module @openai-harness/tool-composition
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { ffmpegTool } from "./ffmpeg/tool";
import { renderElementTool } from "./render-element/tool";
import { fetchOverlayTypesTool } from "./fetch-overlay-types/tool";
import { saveAssetTool } from "./save-asset/tool";

export * from "./ffmpeg/tool";
export * from "./ffmpeg/probe";
export * from "./ffmpeg/utils";
export * from "./render-element/tool";
export * from "./render-element/utils";
export * from "./fetch-overlay-types/tool";
export * from "./save-asset/tool";

/** Cordis plugin name. */
export const name = "tool-composition";

/** The tools service must exist before the family tools can register. */
export const inject = ["tools"];

/**
 * Register every composition tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(ffmpegTool);
  ctx.tools.register(renderElementTool);
  ctx.tools.register(fetchOverlayTypesTool);
  ctx.tools.register(saveAssetTool);
}
