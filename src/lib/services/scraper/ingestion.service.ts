/**
 * Scraper ingestion: parse cards → attach media → reuse/embed → score → persist.
 *
 * Ads are written once per `library_id`; relevance is written to the derived
 * `(query, ad)` relation table.
 *
 * @module @/lib/services/scraper/ingestion.service
 */

import * as repo from "@/lib/repositories/scraper.repo";
import {
  crispAdCardContent,
  isAvatarMediaUrl,
  isMediaUrlExpired,
} from "./display";
import {
  createOpenAIEmbeddingProvider,
  dotProduct,
  type EmbeddingProvider,
} from "./ad.relevance.service";
import { EXACT_CACHE_MIN_SCORE } from "./policy";
import { parseMetaAdCards } from "./scraper.service";
import {
  canonicalizeAdText,
  canonicalizeQueryText,
  computeEmbeddingHash,
  sha256Hex,
} from "./utils";
import type {
  AdMedia,
  AnchoredMedia,
  NewAdQueryRelevance,
  NewScrapedAd,
  ScoredScrapedAd,
  ScrapedAd,
  ScrapedAdCard,
} from "./types";

/**
 * Every live creative URL of one card. Never hashed or embedded; avatars and
 * expired signatures are dropped.
 */
function selectMedia(media: AnchoredMedia | undefined): AdMedia | null {
  if (!media) return null;

  const now = Date.now();
  const isLive = (src: string | undefined): src is string =>
    typeof src === "string" && src.length > 0 && !isMediaUrlExpired(src, now);

  const videos = media.videos.filter(isLive);
  const images = media.images.filter(
    (src) => isLive(src) && !isAvatarMediaUrl(src),
  );

  return videos.length === 0 && images.length === 0 ? null : { videos, images };
}

interface PreparedCard {
  card: ScrapedAdCard;
  displayContent: string;
  media: AdMedia | null;
  canonicalText: string;
  contentHash: string;
}

function prepareCards(
  cards: ScrapedAdCard[],
  mediaByAnchor?: AnchoredMedia[],
): PreparedCard[] {
  const byAnchor = new Map(
    (mediaByAnchor ?? []).map((entry) => [entry.anchor, entry]),
  );

  return cards.map((card) => {
    const media = selectMedia(byAnchor.get(card.libraryId));
    let displayContent = crispAdCardContent(card.content);
    if (media) {
      const lines = [
        ...media.videos.map((src) => `Video: ${src}`),
        ...media.images.map((src) => `Image: ${src}`),
      ].filter(
        (line) => !displayContent.includes(line.slice(line.indexOf(": ") + 2)),
      );

      if (lines.length > 0) {
        displayContent = `${displayContent.trimEnd()}\n\n${lines.join("\n")}`;
      }
    }

    const canonicalText = canonicalizeAdText(card.content);
    return {
      card,
      displayContent,
      media,
      canonicalText,
      contentHash: sha256Hex(canonicalText),
    };
  });
}

interface ResolvedEmbedding {
  embedding: Float32Array;
  embeddingHash: string;
  embeddingModel: string;
}

/**
 * Reuse a stored embedding when `embedding_hash + model` matches the card's
 * canonical text; otherwise embed each unique canonical text once.
 */
async function resolveEmbeddings(
  prepared: PreparedCard[],
  existing: ReadonlyMap<string, ScrapedAd>,
  embedder: EmbeddingProvider,
): Promise<Map<string, ResolvedEmbedding>> {
  const resolved = new Map<string, ResolvedEmbedding>();
  const pending = new Map<string, { text: string; ids: string[] }>();

  for (const item of prepared) {
    const libraryId = item.card.libraryId;
    const embeddingHash = computeEmbeddingHash(
      embedder.model,
      item.canonicalText,
    );
    const stored = existing.get(libraryId);

    if (
      stored?.embedding &&
      stored.embeddingHash === embeddingHash &&
      stored.embeddingModel === embedder.model
    ) {
      resolved.set(libraryId, {
        embedding: stored.embedding,
        embeddingHash,
        embeddingModel: embedder.model,
      });
      continue;
    }

    const group = pending.get(item.contentHash);
    if (group) group.ids.push(libraryId);
    else
      pending.set(item.contentHash, {
        text: item.canonicalText,
        ids: [libraryId],
      });
  }

  if (pending.size === 0) return resolved;

  const items = Array.from(pending.values());
  const vectors = await embedder.embed(items.map((item) => item.text));
  if (vectors.length !== items.length) {
    throw new Error(
      `Embedding provider returned ${vectors.length} vectors for ${items.length} unique ad texts`,
    );
  }

  items.forEach((item, index) => {
    const embedding = vectors[index];
    if (!(embedding instanceof Float32Array) || embedding.length === 0) {
      throw new Error("Embedding provider returned an empty ad vector");
    }
    const embeddingHash = computeEmbeddingHash(embedder.model, item.text);
    for (const libraryId of item.ids) {
      resolved.set(libraryId, {
        embedding,
        embeddingHash,
        embeddingModel: embedder.model,
      });
    }
  });

  return resolved;
}

export interface IngestScrapedAdsParams {
  searchQuery: string;
  rawMarkdown: string;
  mediaByAnchor?: AnchoredMedia[];
  /** Ads already delivered or permanently excluded; never ingested. */
  excludeIds?: Set<string>;
  /** Injectable embedding seam; production uses the OpenAI provider. */
  embedder?: EmbeddingProvider;
}

export interface IngestScrapedAdsResult {
  searchQuery: string;
  totalParsed: number;
  relevantAds: ScoredScrapedAd[];
}

export interface IngestScrapedAdCardsParams {
  searchQuery: string;
  cards: ScrapedAdCard[];
  mediaByAnchor?: AnchoredMedia[];
  /** Injectable embedding seam; production uses the OpenAI provider. */
  embedder?: EmbeddingProvider;
}

export async function ingestScrapedAds({
  searchQuery,
  rawMarkdown,
  mediaByAnchor,
  excludeIds,
  embedder = createOpenAIEmbeddingProvider(),
}: IngestScrapedAdsParams): Promise<IngestScrapedAdsResult> {
  const cards = parseMetaAdCards(rawMarkdown).filter(
    (card) => !excludeIds?.has(card.libraryId),
  );
  return ingestScrapedAdCards({ searchQuery, cards, mediaByAnchor, embedder });
}

/**
 * The same pipeline as `ingestScrapedAds`, for ads that already arrive as
 * structured cards — the Ad Library GraphQL path, which knows each ad's
 * fields directly instead of parsing them out of rendered markdown.
 */
export async function ingestScrapedAdCards({
  searchQuery,
  cards,
  mediaByAnchor,
  embedder = createOpenAIEmbeddingProvider(),
}: IngestScrapedAdCardsParams): Promise<IngestScrapedAdsResult> {
  if (cards.length === 0) {
    return { searchQuery, totalParsed: 0, relevantAds: [] };
  }

  const prepared = prepareCards(cards, mediaByAnchor);
  const existing = repo.getScrapedAdsByIds(cards.map((card) => card.libraryId));
  const embeddings = await resolveEmbeddings(prepared, existing, embedder);

  const queryVector = (
    await embedder.embed([canonicalizeQueryText(searchQuery) || " "])
  )[0];
  if (!(queryVector instanceof Float32Array) || queryVector.length === 0) {
    throw new Error("Embedding provider returned an empty query vector");
  }

  const now = Math.floor(Date.now() / 1000);
  const ads: NewScrapedAd[] = [];
  const relations: NewAdQueryRelevance[] = [];
  const relevantAds: ScoredScrapedAd[] = [];

  for (const item of prepared) {
    const resolved = embeddings.get(item.card.libraryId);
    if (!resolved) {
      throw new Error(
        `Missing embedding for ad ${item.card.libraryId} after resolution`,
      );
    }

    const ad: ScrapedAd = {
      libraryId: item.card.libraryId,
      adUrl: item.card.adUrl,
      content: item.displayContent,
      contentHash: item.contentHash,
      embedding: resolved.embedding,
      embeddingModel: resolved.embeddingModel,
      embeddingHash: resolved.embeddingHash,
      media: item.media,
      startDate: item.card.startDate ?? null,
      status: item.card.status ?? "active",
      firstSeenAt: existing.get(item.card.libraryId)?.firstSeenAt ?? now,
      lastSeenAt: now,
    };

    // Relevance belongs to this (query, ad) pair, never to the ad row.
    const relevanceScore = dotProduct(queryVector, resolved.embedding);

    ads.push(ad);
    relations.push({
      libraryId: ad.libraryId,
      searchQuery: searchQuery.trim(),
      relevanceScore,
      lastSeenAt: now,
    });
    if (relevanceScore >= EXACT_CACHE_MIN_SCORE) {
      relevantAds.push({ ...ad, relevanceScore });
    }
  }

  repo.persistScrapedAds(ads, relations);

  return {
    searchQuery,
    totalParsed: cards.length,
    relevantAds: relevantAds.sort(
      (a, b) => b.relevanceScore - a.relevanceScore,
    ),
  };
}
