/**
 * Model-facing Meta Ads tools: ad accounts, campaigns, ad sets, ads, Graph API
 * queries, Ad Library search, interest validation, and competitor research.
 *
 * The tool definitions moved verbatim from
 * `apps/gateway/src/lib/tools/meta`; their remaining `@/lib/...` imports are
 * temporary application shims. This package is a Cordis plugin: mount it with
 * the `tools` service present and it registers every family tool on
 * `ctx.tools`.
 *
 * @module @openai-harness/tool-meta
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { fetchMetaAdAccountsTool } from "./ad-accounts/fetch-ad-accounts/tool";
import { fetchMetaCampaignsTool } from "./ad-accounts/campaigns/fetch-campaigns/tool";
import { fetchMetaAdSetsTool } from "./ad-accounts/campaigns/ad-sets/fetch-ad-sets/tool";
import { fetchMetaAdsTool } from "./ad-accounts/campaigns/ad-sets/ads/fetch-ads/tool";
import { createMetaCampaignsTool } from "./ad-accounts/campaigns/create-campaigns/tool";
import { createMetaAdTool } from "./ad-accounts/campaigns/ad-sets/ads/create-ad/tool";
import { queryMetaGraphAPITool } from "./query-meta-graph-api/tool";
import { searchAdLibraryTool } from "./search-ad-library/tool";
import { validateMetaInterestsTool } from "./validate-meta-interests/tool";
import { saveCompetitorResearchTool } from "./competitor-research/save-competitor-research/tool";
import { fetchCompetitorResearchesTool } from "./competitor-research/fetch-competitor-researches/tool";
import { saveCampaignBriefTool } from "./campaign-brief/save-campaign-brief/tool";

export * from "./ad-accounts/fetch-ad-accounts/tool";
export * from "./ad-accounts/campaigns/fetch-campaigns/tool";
export * from "./ad-accounts/campaigns/ad-sets/fetch-ad-sets/tool";
export * from "./ad-accounts/campaigns/ad-sets/ads/fetch-ads/tool";
export * from "./ad-accounts/campaigns/create-campaigns/tool";
export * from "./ad-accounts/campaigns/ad-sets/ads/create-ad/tool";
export * from "./query-meta-graph-api/tool";
export * from "./search-ad-library/tool";
export * from "./validate-meta-interests/tool";
export * from "./competitor-research/save-competitor-research/tool";
export * from "./competitor-research/fetch-competitor-researches/tool";
export * from "./campaign-brief/save-campaign-brief/tool";

/** Cordis plugin name. */
export const name = "tool-meta";

/** The tools service must exist before the family tools can register. */
export const inject = ["tools"];

/**
 * Register every Meta tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(fetchMetaAdAccountsTool);
  ctx.tools.register(fetchMetaCampaignsTool);
  ctx.tools.register(fetchMetaAdSetsTool);
  ctx.tools.register(fetchMetaAdsTool);
  ctx.tools.register(createMetaCampaignsTool);
  ctx.tools.register(createMetaAdTool);
  ctx.tools.register(queryMetaGraphAPITool);
  ctx.tools.register(searchAdLibraryTool);
  ctx.tools.register(validateMetaInterestsTool);
  ctx.tools.register(saveCompetitorResearchTool);
  ctx.tools.register(fetchCompetitorResearchesTool);
  ctx.tools.register(saveCampaignBriefTool);
}
