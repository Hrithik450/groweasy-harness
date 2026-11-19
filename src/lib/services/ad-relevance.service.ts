/**
 * Semantic relevance helpers for scraped ads.
 *
 * Recovery note: this module previously lazily imported the optional
 * `@huggingface/transformers` runtime, which is not installed in this project
 * and made the bundle fail to resolve. The OpenAI embedding implementation has
 * the same public surface, so these helpers delegate to it with a static
 * import instead of an unresolvable lazy load.
 *
 * @module @/lib/services/ad-relevance.service
 */

export {
  calculateBatchRelevance,
  calculateRelevance,
  getEmbedding,
} from "./scraper/ad.relevance.service";
