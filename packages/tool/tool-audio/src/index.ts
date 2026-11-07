/**
 * Model-facing audio tools: voice-catalog discovery, text-to-speech, accent
 * conversion, and language dubbing.
 *
 * The tool definitions and their shared `utils.ts` voice catalog moved
 * verbatim from `apps/gateway/src/lib/tools/audio`; their remaining
 * `@/lib/...` imports are temporary application shims. This package is a
 * Cordis plugin: mount it with the `tools` service present and it registers
 * every family tool on `ctx.tools`.
 *
 * @module @openai-harness/tool-audio
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { convertAccentTool } from "./convert-accent/tool";
import { dubAudioTool } from "./dub-audio/tool";
import { generateAudioTool } from "./generate-audio/tool";
import { listVoiceCatalogTool } from "./list-voice-catalog/tool";

export * from "./convert-accent/tool";
export * from "./dub-audio/tool";
export * from "./generate-audio/tool";
export * from "./list-voice-catalog/tool";
export * from "./utils";

/** Cordis plugin name. */
export const name = "tool-audio";

/** The tools service must exist before the family tools can register. */
export const inject = ["tools"];

/**
 * Register every audio tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(convertAccentTool);
  ctx.tools.register(dubAudioTool);
  ctx.tools.register(generateAudioTool);
  ctx.tools.register(listVoiceCatalogTool);
}
