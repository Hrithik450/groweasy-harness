/**
 * OpenAI client seam for the embedding provider.
 *
 * This is the same environment-driven construction the application's
 * `@/lib/agent/client` performed, moved into the package so it imports no
 * application alias. Callers that want a different client pass an explicit
 * {@link EmbeddingProvider} to `ingestScrapedAds` instead.
 *
 * @module @openai-harness/scraper/src/openai.client
 */

import OpenAI from "openai";

let openaiClientInstance: OpenAI | null = null;

/** Resolve the shared OpenAI client, or `null` when no API key is configured. */
export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }
  if (!openaiClientInstance) {
    openaiClientInstance = new OpenAI({
      apiKey: apiKey.trim(),
    });
  }
  return openaiClientInstance;
}

/** Embedding model used by the scraper pipeline. */
export function getOpenAIEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
}
