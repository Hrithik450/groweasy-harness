/**
 * Model-facing web tools: Firecrawl search, page scraping with a direct-asset
 * fallback, and self-hosted alternate scraping with media extraction.
 *
 * The tool definitions moved verbatim from `apps/gateway/src/lib/tools/web`;
 * their remaining `@/lib/...` imports are temporary application shims. This
 * package is a Cordis plugin: mount it with the `tools` service present and it
 * registers every family tool on `ctx.tools`.
 *
 * @module @openai-harness/tool-web
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { searchWebTool } from "./search/tool";
import { scrapeWebPageTool } from "./scrape/tool";
import { alternateWebSearchTool } from "./alternate-scrape/tool";

export * from "./search/tool";
export * from "./scrape/tool";
export * from "./alternate-scrape/tool";

/** Cordis plugin name. */
export const name = "tool-web";

/** The tools service must exist before the family tools can register. */
export const inject = ["tools"];

/**
 * Register every web tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(searchWebTool);
  ctx.tools.register(scrapeWebPageTool);
  ctx.tools.register(alternateWebSearchTool);
}
