/**
 * Single source of truth for scraper relevance/embedding policy.
 *
 * Both the ingestion pipeline and the repository read these values so a
 * threshold change cannot drift between the write and read paths.
 *
 * @module @/lib/services/scraper/policy
 */

/**
 * Similarity floor for a `(query, ad)` relation read.
 *
 * Meta's own search decided that this ad answers this query; the cosine score
 * only orders the result. The floor therefore drops degenerate rows that share
 * no direction with the query at all, instead of re-deciding relevance.
 */
export const EXACT_CACHE_MIN_SCORE = 0.05;

/** Maximum number of texts sent to the embeddings provider per request. */
export const EMBEDDING_BATCH_SIZE = 20;
