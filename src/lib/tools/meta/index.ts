/**
 * Meta Ads tools: ad-account reads, campaign creation, a free-form query
 * surface, and the ad library. Session-memory writers live in `detail.bar/`.
 *
 * @module @/lib/tools/meta
 */

export * from "./query.meta/tool";
export * from "./search.ad.library/tool";

export {
  upsertMetaCampaignToolDefinition,
  executeUpsertMetaCampaignTool,
  type UpsertMetaCampaignArgs,
  type CampaignConfig,
} from "./ad.accounts/campaigns/upsert.campaign/tool";
export {
  upsertMetaAdSetToolDefinition,
  executeUpsertMetaAdSetTool,
  type UpsertMetaAdSetArgs,
  type AdSetConfig,
} from "./ad.accounts/campaigns/ad.sets/upsert.ad.set/tool";
export {
  upsertMetaAdToolDefinition,
  executeUpsertMetaAdTool,
  type UpsertMetaAdArgs,
  type AdConfig,
} from "./ad.accounts/campaigns/ad.sets/ads/upsert.ad/tool";
export {
  fetchMetaPagesToolDefinition,
  executeFetchMetaPagesTool,
  type FetchMetaPagesArgs,
} from "./pages/fetch.pages/tool";
export {
  createMetaCreativeToolDefinition,
  executeCreateMetaCreativeTool,
} from "./ad.accounts/campaigns/ad.sets/ads/create.creative/tool";
export type { MetaCreativeParams } from "@/lib/connectors/meta.ads";
export {
  fetchMetaCreativesToolDefinition,
  executeFetchMetaCreativesTool,
  type FetchMetaCreativesArgs,
} from "./ad.accounts/campaigns/ad.sets/ads/fetch.creatives/tool";
export {
  uploadMetaAssetToolDefinition,
  executeUploadMetaAssetTool,
  type UploadMetaAssetArgs,
} from "./ad.accounts/campaigns/ad.sets/ads/upload.asset/tool";
export type { FetchMetaAdsArgs } from "./ad.accounts/campaigns/ad.sets/ads/fetch.ads/tool";
export type { FetchMetaAdSetsArgs } from "./ad.accounts/campaigns/ad.sets/fetch.ad.sets/tool";
export type { FetchMetaCampaignsArgs } from "./ad.accounts/campaigns/fetch.campaigns/tool";
export type { FetchMetaAdAccountsArgs } from "./ad.accounts/fetch.ad.accounts/tool";
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
