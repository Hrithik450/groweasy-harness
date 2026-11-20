/**
 * Service-facing scraper types.
 *
 * Embeddings cross this boundary as `Float32Array` while storage keeps plain
 * JSON numbers in the `scraped_ads.embedding` text column.
 *
 * @module @/lib/services/scraper/types
 */

/** One durable ad fact as the services consume it. */
export interface ScrapedAd {
  libraryId: string;
  adUrl: string;
  /** Scraped card markdown used for display/telemetry (includes media lines). */
  content: string;
  /** Hash of the canonicalized card text; defines "the same ad version". */
  contentHash: string;
  embedding: Float32Array | null;
  embeddingModel: string | null;
  /** Hash of `embeddingModel + canonical text` the embedding was computed from. */
  embeddingHash: string | null;
  startDate: string | null;
  status: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

/** Insert shape for one ad; optionality mirrors the DB defaults. */
export interface NewScrapedAd {
  libraryId: string;
  adUrl: string;
  content: string;
  contentHash: string;
  embedding?: Float32Array | null;
  embeddingModel?: string | null;
  embeddingHash?: string | null;
  startDate?: string | null;
  status?: string | null;
  firstSeenAt?: number;
  lastSeenAt?: number;
}

/** Insert shape for one `(query, ad)` relevance row. */
export interface NewAdQueryRelevance {
  libraryId: string;
  searchQuery: string;
  relevanceScore: number;
  firstSeenAt?: number;
  lastSeenAt?: number;
}

/** A stored ad joined to its relevance for the query being served. */
export interface ScoredScrapedAd extends ScrapedAd {
  relevanceScore: number;
}
