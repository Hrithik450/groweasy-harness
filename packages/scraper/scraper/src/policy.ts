/**
 * Single source of truth for scraper relevance/embedding policy.
 *
 * Both the ingestion pipeline and the repository read these values so a
 * threshold or batch-size change cannot drift between the write and read paths.
 *
 * Threshold calibration (measured over the stored corpus with
 * `text-embedding-3-small`, query text vs ad-card text):
 *
 * - a live crawl's ad genuinely matched the query only when its cosine sits
 *   around `p50 ≈ 0.25–0.34` and `max ≈ 0.55–0.64`, so gating the exact cache
 *   at 0.5 discarded nearly every real match;
 * - a related paraphrase scores in the same band, so a 0.55 semantic floor sat
 *   above the p99 (~0.51) and effectively could not hit;
 * - brand-name queries (e.g. `Nike`) top out near 0.44, which is why the
 *   semantic floor stays above that: an unrelated brand must still crawl.
 *
 * @module @openai-harness/scraper/src/policy
 */

/**
 * Similarity floor for a `(query, ad)` relation read.
 *
 * Meta's own search decided that this ad answers this query; the cosine score
 * only orders the result. The floor therefore drops degenerate rows that share
 * no direction with the query at all, instead of re-deciding relevance.
 */
export const EXACT_CACHE_MIN_SCORE = 0.05;

/**
 * Minimum cosine similarity for the semantic cache read path.
 *
 * A cache hit here asserts that a *related* query produced this ad, so the bar
 * stays above the band a brand-name query reaches without a topic match
 * (~0.44) while admitting genuine paraphrases (~0.45+).
 */
export const SEMANTIC_CACHE_THRESHOLD = 0.45;

/** Maximum number of memoized query vectors kept in process. */
export const SEMANTIC_QUERY_CACHE_SIZE = 200;

/** How long a memoized query vector stays valid (24 hours). */
export const SEMANTIC_QUERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const EMBEDDING_BATCH_SIZE = 20;

/** Maximum number of in-flight embedding-provider requests. */
export const EMBEDDING_CONCURRENCY = 3;
