/**
 * Scraper ingestion pipeline stages: media attachment, canonicalization,
 * embedding reuse, and cosine scoring.
 *
 * Lifted from the application service with imports retargeted to this package
 * and its JSON-native storage types.
 *
 * @module @openai-harness/scraper/src/pipeline
 */

import type { ScrapedAd } from "./types";
import {
  crispAdCardContent,
  isAvatarMediaUrl,
  isMediaUrlExpired,
} from "./display";
import {
  canonicalizeAdText,
  canonicalizeQueryText,
  computeEmbeddingHash,
  sha256Hex,
} from "./utils";
import {
  dotProduct,
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "./ad.relevance.service";

export type ScrapedAdCard = Pick<
  ScrapedAd,
  "libraryId" | "adUrl" | "content" | "startDate" | "status"
>;

/** Minimal ad facts needed to decide whether a stored embedding is reusable. */
export type ExistingAdEmbedding = Pick<
  ScrapedAd,
  "libraryId" | "embedding" | "embeddingModel" | "embeddingHash"
>;

/**
 * Media URLs grouped under the nearest preceding anchor match in the scraped
 * page HTML (for Meta Ad Library the anchor is the numeric Library ID).
 */
export interface AnchoredMedia {
  anchor: string;
  videos: string[];
  images: string[];
}

/** Maximum creative URLs attached to a single ad card (keeps content compact). */
const MAX_CREATIVE_URLS_PER_AD = 5;

/**
 * Appends per-ad creative URLs to the display markdown. Videos are the primary
 * fix (the crawler extracts them from `<video>` tags that markdown drops);
 * images are only added when they are real creatives already absent from the
 * card text, so the existing static-image path is left untouched. URLs whose
 * signed expiry has already passed are never attached.
 *
 * NOTE: this display content is deliberately *not* used for hashing or
 * embedding — media URLs carry expiring signatures. See `canonicalizeAdText`.
 */
export function attachMediaToCardContent(
  content: string,
  media?: AnchoredMedia,
  nowMs: number = Date.now(),
): string {
  if (!media) return content;

  const isFresh = (src: string | undefined): src is string =>
    typeof src === "string" &&
    src.length > 0 &&
    !content.includes(src) &&
    !isMediaUrlExpired(src, nowMs);

  const videos = media.videos
    .filter(isFresh)
    .slice(0, MAX_CREATIVE_URLS_PER_AD);
  const images = media.images
    .filter((src) => isFresh(src) && !isAvatarMediaUrl(src))
    .slice(0, MAX_CREATIVE_URLS_PER_AD);

  if (videos.length === 0 && images.length === 0) return content;

  const lines = [
    ...videos.map((src) => `Video: ${src}`),
    ...images.map((src) => `Image: ${src}`),
  ];
  return `${content.trimEnd()}\n\n${lines.join("\n")}`;
}

export interface CanonicalAdCard {
  card: ScrapedAdCard;
  /** Markdown shown to the model, including attached media lines. */
  displayContent: string;
  canonicalText: string;
  contentHash: string;
}

/**
 * Stage 2: canonicalize each parsed card. The hash is stable across scrapes
 * even when URLs, counters, or media signatures change.
 */
export function canonicalizeCardBatch(
  cards: ScrapedAdCard[],
  mediaByAnchor?: AnchoredMedia[],
): CanonicalAdCard[] {
  const mediaByLibraryId = new Map(
    (mediaByAnchor ?? []).map((entry) => [entry.anchor, entry]),
  );

  return cards.map((card) => {
    const canonicalText = canonicalizeAdText(card.content);
    return {
      card,
      displayContent: attachMediaToCardContent(
        crispAdCardContent(card.content),
        mediaByLibraryId.get(card.libraryId),
      ),
      canonicalText,
      contentHash: sha256Hex(canonicalText),
    };
  });
}

export interface ResolvedEmbedding {
  embedding: Float32Array;
  embeddingHash: string;
  embeddingModel: string;
}

function asEmbeddingError(error: unknown): EmbeddingProviderError {
  if (error instanceof EmbeddingProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new EmbeddingProviderError(`Embedding provider failed: ${message}`, {
    cause: error,
  });
}

/**
 * Stage 3: reuse a stored embedding when `embedding_hash + model` matches the
 * card's canonical text; otherwise batch-embed each unique canonical text once.
 */
export async function resolveEmbeddings(params: {
  cards: CanonicalAdCard[];
  existingAds: ReadonlyMap<string, readonly ExistingAdEmbedding[]>;
  embedder: EmbeddingProvider;
}): Promise<Map<string, ResolvedEmbedding>> {
  const { cards, existingAds, embedder } = params;
  const resolved = new Map<string, ResolvedEmbedding>();
  const pendingByContentHash = new Map<
    string,
    { canonicalText: string; libraryIds: string[] }
  >();

  for (const card of cards) {
    const embeddingHash = computeEmbeddingHash(
      embedder.model,
      card.canonicalText,
    );
    const existing = existingAds.get(card.card.libraryId)?.[0];

    if (
      existing?.embedding &&
      existing.embeddingHash === embeddingHash &&
      existing.embeddingModel === embedder.model
    ) {
      resolved.set(card.card.libraryId, {
        embedding: existing.embedding,
        embeddingHash,
        embeddingModel: embedder.model,
      });
      continue;
    }

    const pending = pendingByContentHash.get(card.contentHash);
    if (pending) {
      pending.libraryIds.push(card.card.libraryId);
    } else {
      pendingByContentHash.set(card.contentHash, {
        canonicalText: card.canonicalText,
        libraryIds: [card.card.libraryId],
      });
    }
  }

  if (pendingByContentHash.size > 0) {
    const pending = Array.from(pendingByContentHash.values());
    let vectors: Float32Array[];
    try {
      vectors = await embedder.embed(pending.map((item) => item.canonicalText));
    } catch (error) {
      throw asEmbeddingError(error);
    }
    if (vectors.length !== pending.length) {
      throw new EmbeddingProviderError(
        `Embedding provider returned ${vectors.length} vectors for ${pending.length} unique ad texts`,
      );
    }

    pending.forEach((item, index) => {
      const embedding = vectors[index];
      if (!(embedding instanceof Float32Array) || embedding.length === 0) {
        throw new EmbeddingProviderError(
          "Embedding provider returned an empty ad vector",
        );
      }
      const embeddingHash = computeEmbeddingHash(
        embedder.model,
        item.canonicalText,
      );
      for (const libraryId of item.libraryIds) {
        resolved.set(libraryId, {
          embedding,
          embeddingHash,
          embeddingModel: embedder.model,
        });
      }
    });
  }

  return resolved;
}

/** Stage 4a: the query embedding is computed once per ingestion call. */
export async function embedQuery(
  searchQuery: string,
  embedder: EmbeddingProvider,
): Promise<Float32Array> {
  const queryText = canonicalizeQueryText(searchQuery) || " ";
  let vectors: Float32Array[];
  try {
    vectors = await embedder.embed([queryText]);
  } catch (error) {
    throw asEmbeddingError(error);
  }
  const queryVector = vectors[0];
  if (!(queryVector instanceof Float32Array) || queryVector.length === 0) {
    throw new EmbeddingProviderError(
      "Embedding provider returned an empty query vector",
    );
  }
  return queryVector;
}

export interface ScoredAdCard extends CanonicalAdCard {
  embedding: Float32Array;
  embeddingHash: string;
  embeddingModel: string;
  relevanceScore: number;
}

/** Stage 4b: cosine similarity of each ad against the query vector. */
export function scoreCards(
  cards: CanonicalAdCard[],
  embeddings: Map<string, ResolvedEmbedding>,
  queryVector: Float32Array,
): ScoredAdCard[] {
  return cards.map((card) => {
    const resolved = embeddings.get(card.card.libraryId);
    if (!resolved) {
      throw new Error(
        `Missing embedding for ad ${card.card.libraryId} after resolution`,
      );
    }
    return {
      ...card,
      embedding: resolved.embedding,
      embeddingHash: resolved.embeddingHash,
      embeddingModel: resolved.embeddingModel,
      relevanceScore: dotProduct(queryVector, resolved.embedding),
    };
  });
}
