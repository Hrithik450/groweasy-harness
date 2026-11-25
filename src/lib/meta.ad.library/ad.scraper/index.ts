/**
 * Ad scraper internals: markdown parsing, ingestion, and stored-ad reads.
 *
 * @module @/lib/meta.ad.library/ad.scraper
 */

export { buildMetaAdLibraryUrl } from "../urls";
export { parseMetaAdCards } from "../parse";
export { ingestScrapedAds, ingestScrapedAdCards } from "./ingestion.service";
export {
  canonicalizeAdText,
  canonicalizeQueryText,
  computeEmbeddingHash,
  extractAdIdFromReference,
  normalizeQueryKey,
  sha256Hex,
} from "./utils";
export { EXACT_CACHE_MIN_SCORE } from "./policy";
export {
  getAdsByQuery,
  getScrapedAdsByIds,
  persistScrapedAds,
} from "@/lib/repositories/scraper.repo";
export type {
  AnchoredMedia,
  NewAdQueryRelevance,
  NewScrapedAd,
  ScoredScrapedAd,
  ScrapedAd,
  ScrapedAdCard,
} from "./types";
