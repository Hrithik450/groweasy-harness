export {
  buildMetaAdLibraryUrl,
  getAdsByQuery,
  getScrapedAdsByIds,
  parseMetaAdCards,
  persistScrapedAds,
} from "./scraper.service";
export type {
  NewAdQueryRelevance,
  NewScrapedAd,
  ScoredScrapedAd,
  ScrapedAd,
} from "./types";

export { ingestScrapedAds } from "./ingestion.service";
export type {
  IngestScrapedAdsParams,
  IngestScrapedAdsResult,
} from "./ingestion.service";
export type { AnchoredMedia, ScrapedAdCard } from "./pipeline";
export { attachMediaToCardContent } from "./pipeline";

export {
  calculateBatchRelevance,
  calculateRelevance,
  createOpenAIEmbeddingProvider,
  dotProduct,
  getBatchEmbeddings,
  getEmbedding,
} from "./ad.relevance.service";
export type { EmbeddingProvider } from "./ad.relevance.service";

export {
  crispAdCardContent,
  extractMediaUrls,
  isAvatarMediaUrl,
  isMediaUrlExpired,
  mediaUrlExpiresAt,
  stripExpiredMediaLines,
} from "./display";
export type { CardMediaUrls } from "./display";

export {
  canonicalizeAdText,
  canonicalizeQueryText,
  computeEmbeddingHash,
  normalizeQueryKey,
  parseMetaAdDate,
  sha256Hex,
} from "./utils";
export {
  EMBEDDING_BATCH_SIZE,
  EXACT_CACHE_MIN_SCORE,
} from "./policy";
