/**
 * Service-facing scraper types.
 *
 * Embeddings cross this boundary as `Float32Array` while storage keeps plain
 * JSON numbers in the `scraped_ads.embedding` text column.
 *
 * @module @/lib/meta.ad.library/ad.scraper/types
 */

import type {
  ScrapedAdRecord,
  NewScrapedAdRecord,
  NewAdQueryRelevanceRecord,
} from "@/lib/db";

/** Creative URLs for one ad. Never hashed or embedded; they expire. */
export interface AdMedia {
  videos: string[];
  images: string[];
}

/** Media URLs grouped under the card whose anchor precedes them in the HTML. */
export interface AnchoredMedia extends AdMedia {
  anchor: string;
}

/** Minimal ad facts parsed from one Meta Ad Library card. */
export type ScrapedAdCard = Pick<
  ScrapedAd,
  "libraryId" | "adUrl" | "content" | "startDate" | "status"
>;

/**
 * One durable ad fact as the services consume it: the inferred table row, with
 * the JSON text embedding decoded to a vector at the repository boundary.
 */
export type ScrapedAd = Omit<ScrapedAdRecord, "embedding"> & {
  embedding: Float32Array | null;
};

/** Insert shape for one ad; timestamps default in the repository. */
export type NewScrapedAd = Omit<
  NewScrapedAdRecord,
  "embedding" | "firstSeenAt" | "lastSeenAt"
> & {
  embedding?: Float32Array | null;
  firstSeenAt?: number;
  lastSeenAt?: number;
};

/** Insert shape for one `(query, ad)` relevance row. */
export type NewAdQueryRelevance = Omit<
  NewAdQueryRelevanceRecord,
  "firstSeenAt" | "lastSeenAt"
> & {
  firstSeenAt?: number;
  lastSeenAt?: number;
};

/** A stored relation with its relevance score exposed for callers. */
export type ScoredScrapedAd = ScrapedAd & {
  relevanceScore: number;
};
