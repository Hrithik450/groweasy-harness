/**
 * Embedding provider seam and vector helpers for the scraper pipeline.
 *
 * @module @openai-harness/scraper/src/ad.relevance.service
 */

import { getOpenAIClient, getOpenAIEmbeddingModel } from "./openai.client";
import { EMBEDDING_BATCH_SIZE, EMBEDDING_CONCURRENCY } from "./policy";

/** Raised when the embedding provider is unavailable or returns bad output. */
export class EmbeddingProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmbeddingProviderError";
  }
}

/** Raised when two vectors cannot be compared because their dimensions differ. */
export class VectorDimensionError extends Error {
  constructor(left: number, right: number) {
    super(
      `Cannot compare vectors with different dimensions: ${left} vs ${right}`,
    );
    this.name = "VectorDimensionError";
  }
}

/**
 * Small seam around the embedding provider. Tests inject a deterministic fake;
 * production uses `createOpenAIEmbeddingProvider()`.
 */
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

/**
 * Computes cosine similarity between two unit vectors (dot product).
 * Throws on dimension mismatch instead of silently truncating.
 */
export function dotProduct(
  a: Float32Array | number[],
  b: Float32Array | number[],
): number {
  if (a.length !== b.length) {
    throw new VectorDimensionError(a.length, b.length);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return Math.max(0, Math.min(1, sum));
}

/**
 * Runs `fn` over `items` with at most `limit` concurrent invocations.
 * Preserves input order in the result.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const safeLimit = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(safeLimit, items.length) },
      () => worker(),
    ),
  );
  return results;
}

function assertVectors(
  vectors: Float32Array[],
  expectedCount: number,
): Float32Array[] {
  if (vectors.length !== expectedCount) {
    throw new EmbeddingProviderError(
      `Embedding provider returned ${vectors.length} vectors for ${expectedCount} inputs`,
    );
  }
  let dimensions: number | null = null;
  for (const vector of vectors) {
    if (!(vector instanceof Float32Array) || vector.length === 0) {
      throw new EmbeddingProviderError(
        "Embedding provider returned an empty or non-Float32Array vector",
      );
    }
    if (dimensions === null) dimensions = vector.length;
    else if (vector.length !== dimensions) {
      throw new EmbeddingProviderError(
        `Embedding provider returned inconsistent dimensions: ${dimensions} vs ${vector.length}`,
      );
    }
  }
  return vectors;
}

/**
 * Production provider backed by the OpenAI embeddings API. Batches requests and
 * bounds concurrency; any provider failure surfaces as `EmbeddingProviderError`.
 */
export function createOpenAIEmbeddingProvider(): EmbeddingProvider {
  const model = getOpenAIEmbeddingModel();
  return {
    model,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];

      const client = getOpenAIClient();
      if (!client) {
        throw new EmbeddingProviderError(
          "OpenAI client not configured. Please ensure OPENAI_API_KEY is set in environment.",
        );
      }

      const chunks: Array<{ startIndex: number; items: string[] }> = [];
      for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
        chunks.push({
          startIndex: i,
          items: texts.slice(i, i + EMBEDDING_BATCH_SIZE),
        });
      }

      try {
        const chunkResults = await mapWithConcurrency(
          chunks,
          EMBEDDING_CONCURRENCY,
          async (chunk) => {
            const response = await client.embeddings.create({
              model,
              input: chunk.items,
            });
            if (response.data.length !== chunk.items.length) {
              throw new EmbeddingProviderError(
                `Embedding provider returned ${response.data.length} results for ${chunk.items.length} inputs`,
              );
            }
            const sorted = [...response.data].sort((a, b) => a.index - b.index);
            return {
              startIndex: chunk.startIndex,
              vectors: sorted.map((item) => new Float32Array(item.embedding)),
            };
          },
        );

        const results: Float32Array[] = new Array(texts.length);
        for (const chunk of chunkResults) {
          chunk.vectors.forEach((vector, offset) => {
            results[chunk.startIndex + offset] = vector;
          });
        }
        return assertVectors(results, texts.length);
      } catch (error) {
        if (error instanceof EmbeddingProviderError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new EmbeddingProviderError(
          `Embedding provider failed for model "${model}": ${message}`,
          { cause: error },
        );
      }
    },
  };
}
