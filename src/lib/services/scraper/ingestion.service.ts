/**
 * Scraper ingestion pipeline.
 *
 * Pipeline: parse → canonicalize → resolveEmbeddings → score → persist.
 * Ads are written once per `library_id`; relevance is written to the derived
 * `(query, ad)` relation table.
 *
 * @module @/lib/services/scraper/ingestion.service
 */

import {
  getScrapedAdsByIds,
  parseMetaAdCards,
  persistScrapedAds,
} from "./scraper.service";
import {
  createOpenAIEmbeddingProvider,
  type EmbeddingProvider,
} from "./ad.relevance.service";
import {
  canonicalizeCardBatch,
  embedQuery,
  resolveEmbeddings,
  scoreCards,
  type AnchoredMedia,
  type ScrapedAdCard,
} from "./pipeline";
import { EXACT_CACHE_MIN_SCORE } from "./policy";
import type {
  NewAdQueryRelevance,
  NewScrapedAd,
  ScoredScrapedAd,
  ScrapedAd,
} from "./types";

export type { AnchoredMedia, ScrapedAdCard };
export { attachMediaToCardContent } from "./pipeline";

export interface IngestScrapedAdsParams {
  searchQuery: string;
  rawMarkdown?: string;
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

/**
 * Ingests a scraped page as a small pipeline:
 *
 *   parse → canonicalize → resolveEmbeddings → score → persist
 *
 * Any embedding-provider failure aborts the call before anything is persisted,
 * so callers can fall back to previously cached ads.
 */
export async function ingestScrapedAds(
  params: IngestScrapedAdsParams,
): Promise<IngestScrapedAdsResult> {
  const {
    searchQuery,
    rawMarkdown,
    mediaByAnchor,
    excludeIds,
    embedder = createOpenAIEmbeddingProvider(),
  } = params;

  const cards = rawMarkdown
    ? parseMetaAdCards(rawMarkdown).filter(
        (card) => !excludeIds?.has(card.libraryId),
      )
    : [];

  if (cards.length === 0) {
    return { searchQuery, totalParsed: 0, relevantAds: [] };
  }

  // Stage 2: deterministic text + hashes.
  const canonicalCards = canonicalizeCardBatch(cards, mediaByAnchor);

  // Stage 3: reuse stored embeddings; embed each unique canonical text once.
  const existingAdsRes = await getScrapedAdsByIds(
    cards.map((card) => card.libraryId),
  );
  const existingAds: Map<string, ScrapedAd[]> = existingAdsRes;
  const embeddings = await resolveEmbeddings({
    cards: canonicalCards,
    existingAds,
    embedder,
  });

  // Stage 4: one query embedding per call, then cosine score every card.
  const queryVector = await embedQuery(searchQuery, embedder);
  const scoredCards = scoreCards(canonicalCards, embeddings, queryVector);

  // Stage 5: persist ad facts and query↔ad relations.
  const now = Math.floor(Date.now() / 1000);
  const ads: NewScrapedAd[] = scoredCards.map((scored) => ({
    libraryId: scored.card.libraryId,
    adUrl: scored.card.adUrl,
    content: scored.displayContent,
    contentHash: scored.contentHash,
    embedding: scored.embedding,
    embeddingModel: scored.embeddingModel,
    embeddingHash: scored.embeddingHash,
    startDate: scored.card.startDate ?? null,
    status: scored.card.status ?? "active",
    firstSeenAt:
      existingAds.get(scored.card.libraryId)?.[0]?.firstSeenAt ?? now,
    lastSeenAt: now,
  }));
  const relations: NewAdQueryRelevance[] = scoredCards.map((scored) => ({
    libraryId: scored.card.libraryId,
    searchQuery: searchQuery.trim(),
    relevanceScore: scored.relevanceScore,
    lastSeenAt: now,
  }));

  await persistScrapedAds(ads, relations);

  const relevantAds: ScoredScrapedAd[] = scoredCards
    .filter((scored) => scored.relevanceScore >= EXACT_CACHE_MIN_SCORE)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .map((scored) => ({
      libraryId: scored.card.libraryId,
      adUrl: scored.card.adUrl,
      content: scored.displayContent,
      contentHash: scored.contentHash,
      embedding: scored.embedding,
      embeddingModel: scored.embeddingModel,
      embeddingHash: scored.embeddingHash,
      startDate: scored.card.startDate ?? null,
      status: scored.card.status ?? "active",
      firstSeenAt:
        existingAds.get(scored.card.libraryId)?.[0]?.firstSeenAt ?? now,
      lastSeenAt: now,
      relevanceScore: scored.relevanceScore,
    }));

  return {
    searchQuery,
    totalParsed: cards.length,
    relevantAds,
  };
}
