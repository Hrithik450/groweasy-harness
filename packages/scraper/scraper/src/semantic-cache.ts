/**
 * Semantic cache ranking: score stored ads against a query embedding.
 *
 * This is deliberately a pure function over ad facts. The repository supplies
 * the scan (it owns the Maps); the caller supplies the query vector. Keeping
 * the score/filter/order rules here makes the semantic read path testable
 * without storage or an embedding provider.
 *
 * @module @openai-harness/scraper/src/semantic-cache
 */

import { dotProduct } from "./ad.relevance.service";
import { SEMANTIC_CACHE_THRESHOLD } from "./policy";
import type { ScoredScrapedAd, ScrapedAd } from "./types";

/** Filters shared by every cached-ad read. */
export interface SemanticAdFilter {
  /** Ids already delivered/reserved; never returned. */
  excludeIds?: ReadonlySet<string>;
  /** Inclusive launch-date window; ads without a date fail an explicit range. */
  dateRange?: { startDate?: string; endDate?: string };
}

export interface RankAdsByEmbeddingParams extends SemanticAdFilter {
  ads: Iterable<ScrapedAd>;
  queryVector: Float32Array;
  /** Embeddings from a different model are not comparable and are skipped. */
  embeddingModel: string;
  /** Minimum cosine similarity; defaults to {@link SEMANTIC_CACHE_THRESHOLD}. */
  minScore?: number;
  limit?: number;
}

/**
 * Score every comparable stored ad against `queryVector` and return those at
 * or above `minScore`, best match first.
 *
 * Ads with no embedding, or one produced by another model, are skipped rather
 * than compared: `dotProduct` throws on a dimension mismatch, and a mixed-model
 * vector space is not meaningful even when the dimensions happen to agree.
 */
export function rankAdsByEmbedding(
  params: RankAdsByEmbeddingParams,
): ScoredScrapedAd[] {
  const {
    ads,
    queryVector,
    embeddingModel,
    excludeIds,
    dateRange,
    minScore = SEMANTIC_CACHE_THRESHOLD,
    limit,
  } = params;

  const results: ScoredScrapedAd[] = [];

  for (const ad of ads) {
    if (ad.embedding === null) continue;
    if (ad.embeddingModel !== embeddingModel) continue;
    if (ad.status.trim().toLowerCase() !== "active") continue;
    if (excludeIds?.has(ad.libraryId)) continue;

    // Match the exact-query path: a NULL launch date fails an explicit range.
    if (dateRange?.startDate !== undefined) {
      if (ad.startDate === null || ad.startDate < dateRange.startDate) continue;
    }
    if (dateRange?.endDate !== undefined) {
      if (ad.startDate === null || ad.startDate > dateRange.endDate) continue;
    }

    const relevanceScore = dotProduct(queryVector, ad.embedding);
    if (relevanceScore < minScore) continue;

    results.push({ ...ad, relevanceScore });
  }

  results.sort(
    (a, b) =>
      b.relevanceScore - a.relevanceScore || b.lastSeenAt - a.lastSeenAt,
  );

  return limit !== undefined && limit > 0 ? results.slice(0, limit) : results;
}
