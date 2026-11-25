/**
 * Scraper public surface: card parsing, ingestion, and stored-ad reads.
 *
 * @module @/lib/services/scraper
 */

export { buildMetaAdLibraryUrl, parseMetaAdCards } from "./scraper.service";
export { ingestScrapedAds, ingestScrapedAdCards } from "./ingestion.service";
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
