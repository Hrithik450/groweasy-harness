/**
 * Model-facing account tools: business profile fetch/save, the Ad Manager
 * `alerts`, `suggestions`, and `campaigns` tools, and the Ad Strategist
 * `reports` writer.
 *
 * The tool definitions and their shared `business.profile/utils.ts` moved
 * verbatim from `apps/gateway/src/lib/tools/account`; their remaining
 * `@/lib/...` imports are temporary application shims. This package is a
 * Cordis plugin: mount it with the `tools` service present and it registers
 * every family tool on `ctx.tools`.
 *
 * @module @openai-harness/tool-account
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { saveBusinessProfileTool } from "./business.profile/save.business.profile/tool";
import { fetchBusinessProfileTool } from "./business.profile/fetch.business.profile/tool";
import { updateAlertsTool } from "./alerts/update.alerts/tool";
import { updateSuggestionsTool } from "./suggestions/update.suggestions/tool";
import { updateCampaignsTool } from "./campaigns/update.campaigns/tool";
import { saveReportTool } from "./reports/save.report/tool";

export * from "./business.profile/save.business.profile/tool";
export * from "./business.profile/fetch.business.profile/tool";
export * from "./business.profile/utils";
export * from "./alerts/update.alerts/tool";
export * from "./suggestions/update.suggestions/tool";
export * from "./campaigns/update.campaigns/tool";
export * from "./reports/save.report/tool";

/** Cordis plugin name. */
export const name = "tool-account";

/** The tools service must exist before the family tools can register. */
export const inject = ["tools"];

/**
 * Register every account tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(saveBusinessProfileTool);
  ctx.tools.register(fetchBusinessProfileTool);
  ctx.tools.register(updateAlertsTool);
  ctx.tools.register(updateSuggestionsTool);
  ctx.tools.register(updateCampaignsTool);
  ctx.tools.register(saveReportTool);
}
