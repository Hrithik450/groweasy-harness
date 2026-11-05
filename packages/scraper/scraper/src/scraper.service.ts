/**
 * Response-wrapping service facade for scraper storage operations.
 *
 * The free functions keep the application-facing signatures; they resolve the
 * process-wide repository bound by the plugin or by host composition.
 *
 * @module @openai-harness/scraper/src/scraper.service
 */

import {
  createOpenAIEmbeddingProvider,
  type EmbeddingProvider,
} from "./ad.relevance.service";
import { embedQuery } from "./pipeline";
import {
  SEMANTIC_CACHE_THRESHOLD,
  SEMANTIC_QUERY_CACHE_SIZE,
  SEMANTIC_QUERY_CACHE_TTL_MS,
} from "./policy";
import { requireScraperRepository } from "./repository";
import type {
  NewAdQueryRelevance,
  NewScrapedAd,
  Response,
  ScoredScrapedAd,
  ScrapedAd,
} from "./types";
import { normalizeQueryKey } from "./utils";

export type { ScrapedAd, NewScrapedAd, NewAdQueryRelevance, ScoredScrapedAd };

export interface SemanticQueryOptions {
  /** Injectable embedding seam; production creates the OpenAI provider. */
  embedder?: EmbeddingProvider;
  /** Override the {@link SEMANTIC_CACHE_THRESHOLD} cosine floor (tests). */
  minScore?: number;
}

/** Semantic read result; `semantic` lets callers label a cache-assisted answer. */
export interface SemanticAdsResponse extends Response<ScoredScrapedAd[]> {
  semantic?: true;
  /** The query text whose vector produced these matches. */
  matchedQuery?: string;
}

interface CachedQueryVector {
  vector: Float32Array;
  model: string;
  expiresAt: number;
}

/**
 * Memoized query vectors keyed by {@link normalizeQueryKey}. Repeats of the
 * same search (including casing/whitespace variants) reuse the vector, while a
 * paraphrase still pays exactly one embedding call. The map is deliberately
 * in-process: embeddings are cheap to recompute after a restart.
 */
const queryVectorCache = new Map<string, CachedQueryVector>();

/** Drop expired entries; Map iteration order makes this O(size). */
function pruneQueryVectorCache(now: number): void {
  for (const [key, entry] of queryVectorCache) {
    if (entry.expiresAt <= now) queryVectorCache.delete(key);
  }
}

/** Embed through the provider seam, memoizing by normalized query + model. */
async function resolveQueryVector(
  searchQuery: string,
  embedder: EmbeddingProvider,
): Promise<Float32Array> {
  const key = normalizeQueryKey(searchQuery);
  const now = Date.now();
  const cached = queryVectorCache.get(key);
  if (
    cached !== undefined &&
    cached.model === embedder.model &&
    cached.expiresAt > now
  ) {
    return cached.vector;
  }

  pruneQueryVectorCache(now);
  while (queryVectorCache.size >= SEMANTIC_QUERY_CACHE_SIZE) {
    const oldest = queryVectorCache.keys().next();
    if (oldest.done === true) break;
    queryVectorCache.delete(oldest.value);
  }

  const vector = await embedQuery(searchQuery, embedder);
  queryVectorCache.set(key, {
    vector,
    model: embedder.model,
    expiresAt: now + SEMANTIC_QUERY_CACHE_TTL_MS,
  });
  return vector;
}

/**
 * Retrieves relevant ads for a search query via the `(query, ad)` relation
 * table, with exclusion, date filtering, and limit.
 */
export async function getAdsByQuery(
  searchQuery: string,
  excludeIds?: Set<string>,
  limit?: number,
  dateRange?: { startDate?: string; endDate?: string },
): Promise<Response<ScoredScrapedAd[]>> {
  try {
    const data = requireScraperRepository().getAdsByQuery(
      searchQuery,
      excludeIds,
      limit,
      dateRange,
    );
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves stored ads semantically close to `searchQuery`.
 *
 * The exact cache keys on the query string and therefore misses paraphrases
 * ("WhatsApp chatbot" vs "WhatsApp chat") even when a previous crawl already
 * stored an ad that answers the new phrasing. This read path scores every
 * stored ad embedding against the query embedding instead, so a related
 * earlier search can satisfy the request without a live crawl.
 *
 * The query embedding (~100–300 ms) is memoized for
 * {@link SEMANTIC_QUERY_CACHE_TTL_MS}; it is part of the cache path, never the
 * scrape path.
 */
export async function getAdsBySemanticQuery(
  searchQuery: string,
  excludeIds?: Set<string>,
  limit?: number,
  dateRange?: { startDate?: string; endDate?: string },
  options: SemanticQueryOptions = {},
): Promise<SemanticAdsResponse> {
  try {
    const repository = requireScraperRepository();
    // Nothing stored yet: every future lookup would score an empty scan, so
    // skip the embedding call entirely and let the caller crawl.
    if (!repository.hasScrapedAds()) {
      return {
        success: true,
        data: [],
        semantic: true,
        matchedQuery: searchQuery.trim(),
      };
    }

    const embedder = options.embedder ?? createOpenAIEmbeddingProvider();
    const queryVector = await resolveQueryVector(searchQuery, embedder);
    const data = repository.getAdsByEmbedding({
      queryVector,
      embeddingModel: embedder.model,
      excludeIds,
      limit,
      dateRange,
      minScore: options.minScore ?? SEMANTIC_CACHE_THRESHOLD,
    });
    return {
      success: true,
      data,
      semantic: true,
      matchedQuery: searchQuery.trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves scraped ads by their libraryIds in a single query (supports 1 or many).
 * Returns a Map where key is libraryId and value is the matching record list.
 */
export async function getScrapedAdsByIds(
  libraryIds: string[],
): Promise<Response<Map<string, ScrapedAd[]>>> {
  try {
    const data = requireScraperRepository().getScrapedAdsByIds(libraryIds);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Persists ad facts and per-query relevance rows.
 */
export async function persistScrapedAds(
  ads: NewScrapedAd[],
  relations: NewAdQueryRelevance[],
): Promise<Response<void>> {
  try {
    await requireScraperRepository().persistScrapedAds(ads, relations);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Refreshes `last_seen_at` on ads and their query relations.
 */
export async function touchScrapedAds(
  items: Array<{ libraryId: string; searchQuery: string }>,
): Promise<Response<void>> {
  try {
    await requireScraperRepository().touchScrapedAds(items);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
