/**
 * Service-facing scraper types.
 *
 * These mirror the application's former Drizzle-inferred shapes so existing
 * call sites keep compiling, while the durable domain records in `./spec` stay
 * JSON-native (an embedding is a `number[]` on the medium and a `Float32Array`
 * at this boundary).
 *
 * @module @openai-harness/scraper/src/types
 */

/** Generic standard response returned by the scraper service operations. */
export type Response<TData = unknown> = {
  success?: boolean;
  data?: TData;
  error?: string;
};

/** A stored ad joined to its relevance for the query being served. */
export interface ScoredScrapedAd extends ScrapedAd {
  relevanceScore: number;
}

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

/** Insert shape for one ad; mirroring Drizzle's `$inferInsert` optionality. */
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
