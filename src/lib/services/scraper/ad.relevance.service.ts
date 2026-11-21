import {
  getOpenAIClient,
  getOpenAIEmbeddingModel,
} from "@/lib/core/agent/client";
import { EMBEDDING_BATCH_SIZE } from "./policy";

/** OpenAI's per-input cap; canonical ad text is already URL-free. */
const MAX_EMBEDDING_CHARS = 20_000;

/**
 * Cosine similarity between two unit vectors. OpenAI embeddings are unit
 * normalized, so the dot product is the cosine.
 */
export function dotProduct(
  a: Float32Array | number[],
  b: Float32Array | number[],
): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return Math.max(0, Math.min(1, sum));
}

/** Small seam around the embedding provider so tests can inject a fake. */
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export function createOpenAIEmbeddingProvider(): EmbeddingProvider {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY is required for ad embeddings.");
  }
  const model = getOpenAIEmbeddingModel();

  return {
    model,
    embed: async (texts) => {
      if (texts.length === 0) return [];
      const input = texts.map((text) =>
        text.length > MAX_EMBEDDING_CHARS
          ? text.slice(0, MAX_EMBEDDING_CHARS)
          : text,
      );

      const results: Float32Array[] = new Array(input.length);
      const chunks: number[] = [];
      for (let i = 0; i < input.length; i += EMBEDDING_BATCH_SIZE) {
        chunks.push(i);
      }

      const responses = await Promise.all(
        chunks.map((start) =>
          client.embeddings.create({
            model,
            input: input.slice(start, start + EMBEDDING_BATCH_SIZE),
          }),
        ),
      );

      responses.forEach((response, chunkIndex) => {
        const start = chunks[chunkIndex];
        for (const item of response.data) {
          results[start + item.index] = new Float32Array(item.embedding);
        }
      });

      return results;
    },
  };
}
