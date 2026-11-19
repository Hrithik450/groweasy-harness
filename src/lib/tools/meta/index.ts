/**
 * Meta Ads tools: ad-account reads, campaign creation, a free-form query
 * surface, and the ad library. Session-memory writers live in `session.projections/`.
 *
 * @module @/lib/tools/meta
 */

export * from "./query.meta/tool";
export * from "./search.ad.library/tool";

export {
  createMetaCampaignsTool,
  createMetaCampaignTool,
  type CreateMetaCampaignsArgs,
  type SingleCampaignConfig,
} from "./ad.accounts/campaigns/create.campaigns/tool";
export type { FetchMetaAdsArgs } from "./ad.accounts/campaigns/ad.sets/ads/fetch.ads/tool";
export type { FetchMetaAdSetsArgs } from "./ad.accounts/campaigns/ad.sets/fetch.ad.sets/tool";
export type { FetchMetaCampaignsArgs } from "./ad.accounts/campaigns/fetch.campaigns/tool";
export type { FetchMetaAdAccountsArgs } from "./ad.accounts/fetch.ad.accounts/tool";

/** The tool-builder definition under the registry's `*ToolDefinition` name. */
export { createMetaCampaignsTool as createMetaCampaignsToolDefinition } from "./ad.accounts/campaigns/create.campaigns/tool";

import { createMetaCampaignsTool as createMetaCampaignsDefinition } from "./ad.accounts/campaigns/create.campaigns/tool";
import type { CreateMetaCampaignsArgs as CreateMetaCampaignsInput } from "./ad.accounts/campaigns/create.campaigns/tool";

/** Run campaign creation through the tool-builder definition's own executor. */
export async function executeCreateMetaCampaignsTool(input: {
  args: CreateMetaCampaignsInput;
}) {
  return createMetaCampaignsDefinition.execute(input.args, {});
}
export {
  fetchMetaAdAccountsToolDefinition,
  executeFetchMetaAdAccountsTool,
} from "./ad.accounts/fetch.ad.accounts/tool";
export {
  fetchMetaCampaignsToolDefinition,
  executeFetchMetaCampaignsTool,
} from "./ad.accounts/campaigns/fetch.campaigns/tool";
export {
  fetchMetaAdSetsToolDefinition,
  executeFetchMetaAdSetsTool,
} from "./ad.accounts/campaigns/ad.sets/fetch.ad.sets/tool";
export {
  fetchMetaAdsToolDefinition,
  executeFetchMetaAdsTool,
} from "./ad.accounts/campaigns/ad.sets/ads/fetch.ads/tool";

