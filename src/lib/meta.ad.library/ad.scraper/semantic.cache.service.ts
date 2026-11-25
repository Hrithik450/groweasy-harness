/**
 * Read-time semantic cache lookup.
 *
 * The exact-query cache only answers a query that has literally been searched
 * before. This service embeds the incoming query and scores it against the
 * stored ad vectors, so a paraphrase ("WhatsApp marketing platform" vs
 * "WhatsApp marketing platform India") reuses ads ingested under another
 * query. Matches are written back as `(query, ad)` rows, so the next identical
 * search is a plain SQL hit.
 *
 * @module @/lib/meta.ad.library/ad.scraper/semantic.cache.service
 */

import {
  getAdEmbeddingsForModel,
  getScrapedAdsByIds,
  persistScrapedAds,
  type AdEmbeddingVector,
} from "@/lib/repositories/scraper.repo";
import {
  createOpenAIEmbeddingProvider,
  dotProduct,
} from "./ad.relevance.service";
import { canonicalizeQueryText } from "./utils";
import type { NewAdQueryRelevance, ScoredScrapedAd } from "./types";

/**
 * Cosine threshold for semantic reuse. Exact-key rows use a much lower floor
 * because they were scored against a query the ads were ingested for; a
 * paraphrase needs a real semantic match to count as a cache hit.
 */
export const SEMANTIC_CACHE_MIN_SCORE = (() => {
  const raw = Number(process.env.SEMANTIC_CACHE_MIN_SCORE);
  return Number.isFinite(raw) && raw > 0 ? raw : 0.4;
})();

const VECTOR_CACHE_TTL_MS = 60_000;

let vectorCache: {
  model: string;
  loadedAt: number;
  vectors: AdEmbeddingVector[];
} | null = null;

/** Called after ingestion so newly stored ads are visible to matching. */
export function invalidateSemanticCache(): void {
  vectorCache = null;
}

function loadVectors(model: string): AdEmbeddingVector[] {
  const now = Date.now();
  if (
    vectorCache !== null &&
    vectorCache.model === model &&
    now - vectorCache.loadedAt < VECTOR_CACHE_TTL_MS
  ) {
    return vectorCache.vectors;
  }
  const vectors = getAdEmbeddingsForModel(model);
  vectorCache = { model, loadedAt: now, vectors };
  return vectors;
}

export interface SemanticCacheParams {
  query: string;
  excludeIds?: ReadonlySet<string>;
  limit: number;
}

/**
 * Ads already in the corpus that answer this query semantically. Returns `[]`
 * when embeddings are unavailable, so callers fall through to the live scan.
 */
export async function findSemanticallyCachedAds(
  params: SemanticCacheParams,
): Promise<ScoredScrapedAd[]> {
  const text = canonicalizeQueryText(params.query) || " ";

  let provider;
  try {
    provider = createOpenAIEmbeddingProvider();
  } catch {
    return [];
  }

  let queryVector: Float32Array | undefined;
  try {
    [queryVector] = await provider.embed([text]);
  } catch {
    return [];
  }
  if (!(queryVector instanceof Float32Array) || queryVector.length === 0) {
    return [];
  }

  const vectors = loadVectors(provider.model);
  if (vectors.length === 0) return [];

  const scored: Array<{ libraryId: string; score: number }> = [];
  for (const vector of vectors) {
    if (params.excludeIds?.has(vector.libraryId)) continue;
    if (vector.embedding.length !== queryVector.length) continue;
    const score = dotProduct(queryVector, vector.embedding);
    if (score >= SEMANTIC_CACHE_MIN_SCORE) {
      scored.push({ libraryId: vector.libraryId, score });
    }
  }
  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.max(1, params.limit));
  const ads = getScrapedAdsByIds(top.map((item) => item.libraryId));

  const results: ScoredScrapedAd[] = [];
  const relations: NewAdQueryRelevance[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const item of top) {
    const ad = ads.get(item.libraryId);
    if (!ad) continue;
    results.push({ ...ad, relevanceScore: item.score });
    relations.push({
      libraryId: ad.libraryId,
      searchQuery: params.query.trim(),
      relevanceScore: item.score,
      lastSeenAt: now,
    });
  }

  if (relations.length > 0) {
    // Next identical query is an exact-key hit; no embedding call needed.
    persistScrapedAds([], relations);
  }

  return results;
}
