import { getOpenAIClient, getOpenAIEmbeddingModel } from "@/lib/core/agent/client";

/**
 * Strips raw URLs, markdown images, and markdown links on the fly for semantic embedding.
 * Keeps link text if available.
 */
export function stripUrlsForEmbedding(content: string): string {
  if (!content) return "";
  return content
    .replace(/!\[.*?\]\([^\)]*\)/g, "") // remove markdown images
    .replace(/\[([^\]]*)\]\([^\)]*\)/g, "$1") // preserve markdown link anchor text
    .replace(/https?:\/\/\S+/g, "") // remove bare URLs
    .replace(/[ \t]+/g, " ") // normalize horizontal spaces
    .replace(/\n\s*\n+/g, "\n") // normalize multiple newlines
    .trim();
}

/**
 * Computes cosine similarity between two unit vectors (dot product).
 * Since OpenAI embeddings are unit normalized (L2 norm = 1.0), dot product equals cosine similarity.
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

/**
 * Small seam around the embedding provider. Tests can inject a deterministic
 * fake; production uses {@link createOpenAIEmbeddingProvider}.
 */
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

/**
 * Production provider backed by the target's batched OpenAI helpers. Keeping
 * the model id on the object lets the pipeline key embedding reuse on it.
 */
export function createOpenAIEmbeddingProvider(): EmbeddingProvider {
  return {
    model: getOpenAIEmbeddingModel(),
    embed: (texts) => getBatchEmbeddings(texts),
  };
}

/**
 * Computes vector embeddings in optimal 20-item batches using OpenAI Embeddings API.
 * Chunks of 20 execute concurrently via Promise.all for minimal latency and maximum throughput.
 */
export async function getBatchEmbeddings(
  texts: string[],
  batchSize = 20,
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const client = getOpenAIClient();
  if (!client) {
    throw new Error(
      "OpenAI client not configured. Please ensure OPENAI_API_KEY is set in environment.",
    );
  }

  // One card can carry a whole landing page of text; the embeddings API
  // rejects any single input above 8192 tokens, so cap it well below that.
  const MAX_EMBEDDING_CHARS = 6000;
  const cleanedTexts = texts.map((text) => {
    const cleaned = stripUrlsForEmbedding(text) || " ";
    return cleaned.length > MAX_EMBEDDING_CHARS
      ? cleaned.slice(0, MAX_EMBEDDING_CHARS)
      : cleaned;
  });
  const model = getOpenAIEmbeddingModel();

  const chunks: Array<{ startIndex: number; items: string[] }> = [];
  for (let i = 0; i < cleanedTexts.length; i += batchSize) {
    chunks.push({
      startIndex: i,
      items: cleanedTexts.slice(i, i + batchSize),
    });
  }

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await client.embeddings.create({
        model,
        input: chunk.items,
      });

      const sorted = response.data.sort((a, b) => a.index - b.index);
      return {
        startIndex: chunk.startIndex,
        vectors: sorted.map((item) => new Float32Array(item.embedding)),
      };
    }),
  );

  const results: Float32Array[] = new Array(cleanedTexts.length);
  for (const chunk of chunkResults) {
    for (let j = 0; j < chunk.vectors.length; j++) {
      results[chunk.startIndex + j] = chunk.vectors[j];
    }
  }

  return results;
}

/**
 * Computes vector embedding for a single text string (delegates to getBatchEmbeddings).
 */
export async function getEmbedding(text: string): Promise<Float32Array> {
  const [vec] = await getBatchEmbeddings([text]);
  return vec ?? new Float32Array(1536);
}

/**
 * Efficiently computes relevance scores for multiple ads against a single search query.
 * The query and ad embeddings are calculated in batch.
 */
export async function calculateBatchRelevance(
  query: string,
  adTexts: string[],
): Promise<number[]> {
  if (!query.trim() || adTexts.length === 0) {
    return adTexts.map(() => 0);
  }

  const allEmbeddings = await getBatchEmbeddings([query, ...adTexts]);
  const queryVec = allEmbeddings[0];
  const adVecs = allEmbeddings.slice(1);

  return adVecs.map((adVec) => dotProduct(queryVec, adVec));
}

/**
 * Computes semantic relevance score between a single query and ad text (delegates to calculateBatchRelevance).
 */
export async function calculateRelevance(
  query: string,
  adText: string,
): Promise<number> {
  const [score] = await calculateBatchRelevance(query, [adText]);
  return score ?? 0;
}
