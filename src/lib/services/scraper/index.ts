export {
  buildMetaAdLibraryUrl,
  getAdsByQuery,
  getScrapedAdsByIds,
  parseMetaAdCards,
  touchScrapedAds,
  upsertScrapedAds,
} from "./scraper.service";
export type {
  NewScrapedAdRecord,
  ScrapedAd,
  ScrapedAdRecord,
} from "./scraper.service";

export { ingestScrapedAds } from "./ingestion.service";
export type {
  IngestAdsOptions,
  IngestionAdStatus,
  IngestResult,
  ProcessedAdItem,
  RawScrapedAdCard,
} from "./ingestion.service";

export {
  calculateBatchRelevance,
  calculateRelevance,
  dotProduct,
  getBatchEmbeddings,
  getEmbedding,
} from "./ad.relevance.service";
