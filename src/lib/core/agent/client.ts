/**
 * OpenAI SDK client and model names.
 *
 * The harness owns the conversation loop, so the client is never used for
 * server-side threads, assistants, or agent sessions — only for one-shot
 * requests issued by a model driver.
 *
 * @module @/lib/core/agent/client
 */

import OpenAI from "openai";

let openaiClientInstance: OpenAI | null = null;

/** Shared SDK client, or `null` when no API key is configured. */
export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }
  if (!openaiClientInstance) {
    openaiClientInstance = new OpenAI({
      apiKey: apiKey.trim(),
      ...(process.env.OPENAI_BASE_URL?.trim()
        ? { baseURL: process.env.OPENAI_BASE_URL.trim() }
        : {}),
    });
  }
  return openaiClientInstance;
}

/** Chat model used for turns driven through the Responses API. */
export function getOpenAIModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.OPENAI_AGENT_MODEL?.trim() ||
    "gpt-6.1-sol"
  );
}

/** Embedding model used by the scraper's similarity search. */
export function getOpenAIEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
}
