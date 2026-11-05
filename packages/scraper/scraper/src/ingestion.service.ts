/**
 * Meta Ad Library page parsing, URL construction, and the ingestion pipeline.
 *
 * Pipeline: parse → canonicalize → resolveEmbeddings → score → persist.
 *
 * @module @openai-harness/scraper/src/ingestion.service
 */

import { getScrapedAdsByIds, persistScrapedAds } from "./scraper.service";
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
  NewScrapedAd,
  NewAdQueryRelevance,
  ScrapedAd,
  ScoredScrapedAd,
} from "./types";
import { parseMetaAdDate } from "./utils";

export type { AnchoredMedia, ScrapedAdCard };
export { attachMediaToCardContent } from "./pipeline";

/**
 * Build one card from a chunk of a card's markdown.
 *
 * The status line is not always exactly "Active"/"Inactive" — Meta appends
 * labels such as "Low impression count" ("ActiveLow impression count"), which
 * a strict regex would silently drop.
 */
function toAdCard(
  libraryId: string,
  chunk: string,
  status: string,
): ScrapedAdCard {
  const dateMatch = chunk.match(/Started running on ([^\n·]+)/i);
  return {
    libraryId,
    adUrl: `https://www.facebook.com/ads/library/?id=${libraryId}`,
    content: chunk,
    startDate: dateMatch ? parseMetaAdDate(dateMatch[0]) : null,
    status,
  };
}

/** One parsed card plus the markdown offset it starts at. */
interface PositionedCard {
  card: ScrapedAdCard;
  index: number;
}

/** Index of the next `Library ID:` anchor after `fromIndex`, or the end. */
function nextAnchorIndex(markdownText: string, fromIndex: number): number {
  const next = markdownText.indexOf("Library ID:", fromIndex);
  return next === -1 ? markdownText.length : next;
}

/** Strict pass: Meta's normal layout, status line immediately above the id. */
function parseAnchoredCards(markdownText: string): PositionedCard[] {
  const pattern =
    /^[ \t\u200b\u200c\u200d\ufeff]*(Active|Inactive)[^\n]*\n(?:[ \t\u200b\u200c\u200d\ufeff]*\n)*[ \t\u200b\u200c\u200d\ufeff]*Library ID:\s*(\d+)/gim;
  const matches = Array.from(markdownText.matchAll(pattern));
  const parsedCards: PositionedCard[] = [];
  const seenIds = new Set<string>();

  for (const match of matches) {
    const libraryId = match[2];
    if (seenIds.has(libraryId)) continue;
    seenIds.add(libraryId);

    const startIndex = match.index ?? 0;
    // Stop at the next anchor of any kind, not just the next strict match, so
    // a stateless card cannot leak into this card's chunk.
    const idIndex = markdownText.indexOf(
      `Library ID: ${libraryId}`,
      startIndex,
    );
    const nextStartIndex = nextAnchorIndex(
      markdownText,
      idIndex === -1 ? startIndex : idIndex + 1,
    );

    parsedCards.push({
      index: startIndex,
      card: toAdCard(
        libraryId,
        markdownText.slice(startIndex, nextStartIndex).trim(),
        match[1].toLowerCase() === "active" ? "active" : "inactive",
      ),
    });
  }

  return parsedCards;
}

/**
 * Loose pass: anchor on the Library ID alone.
 *
 * The crawler sometimes snapshots the feed after the status label has been
 * replaced by a skeleton/placeholder while cards are still hydrating. Parsing
 * those cards (status read from the nearest preceding label, defaulting to
 * active because the Ad Library URL only requests running ads) keeps a partial
 * page usable instead of reporting a silent zero-ad result.
 */
function parseLibraryIdAnchoredCards(
  markdownText: string,
): PositionedCard[] {
  const pattern = /Library ID:\s*(\d+)/g;
  const matches = Array.from(markdownText.matchAll(pattern));
  const parsedCards: PositionedCard[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const libraryId = match[1];
    if (seenIds.has(libraryId)) continue;
    seenIds.add(libraryId);

    const startIndex = match.index ?? 0;
    const nextStartIndex =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? markdownText.length)
        : markdownText.length;

    const before = markdownText.slice(
      Math.max(0, startIndex - 240),
      startIndex,
    );
    const statusMatch = /(?:^|\n)[ \t]*(Active|Inactive)\b[^\n]*[ \t]*$/i.exec(
      before,
    );
    const status =
      statusMatch !== null && statusMatch[1].toLowerCase() === "inactive"
        ? "inactive"
        : "active";

    parsedCards.push({
      index: startIndex,
      card: toAdCard(
        libraryId,
        markdownText.slice(startIndex, nextStartIndex).trim(),
        status,
      ),
    });
  }

  return parsedCards;
}

/**
 * Parses raw scraped Meta Ad Library markdown text into complete individual ad
 * card blocks.
 *
 * The loose anchor finds every card; the strict pass then replaces the cards
 * whose status line it recognized, so a page where only some cards hydrated
 * still yields all of them, in feed order.
 */
export function parseMetaAdCards(markdownText: string): ScrapedAdCard[] {
  if (!markdownText || typeof markdownText !== "string") return [];

  const byId = new Map<string, PositionedCard>();
  for (const positioned of parseLibraryIdAnchoredCards(markdownText)) {
    byId.set(positioned.card.libraryId, positioned);
  }
  for (const positioned of parseAnchoredCards(markdownText)) {
    byId.set(positioned.card.libraryId, positioned);
  }

  return [...byId.values()]
    .sort((a, b) => a.index - b.index)
    .map((positioned) => positioned.card);
}

/**
 * Helper to dynamically compute search query parameters for Meta Ad Library scrape.
 */
export function buildMetaAdLibraryUrl(params: {
  query: string;
  locale?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
  mediaType?: "all" | "image" | "video";
}): string {
  const {
    query,
    locale = "en_US",
    country = "IN",
    startDate,
    endDate,
    mediaType = "all",
  } = params;

  const url = new URL("https://www.facebook.com/ads/library/");
  url.searchParams.set("active_status", "active");
  url.searchParams.set("ad_type", "all");
  url.searchParams.set("country", country);
  url.searchParams.set("is_targeted_country", "false");
  url.searchParams.set("media_type", mediaType);
  url.searchParams.set("q", query);
  url.searchParams.set("search_type", "keyword_unordered");
  url.searchParams.set("sort_data[direction]", "desc");
  url.searchParams.set("sort_data[mode]", "relevancy_monthly_grouped");
  url.searchParams.set("locale", locale);

  let finalMinDate = startDate;
  let finalMaxDate = endDate;

  if (!finalMinDate || !finalMaxDate) {
    const now = new Date();
    finalMaxDate = finalMaxDate || now.toISOString().split("T")[0];
    const defaultStart = new Date(now);
    defaultStart.setDate(now.getDate() - 30);
    finalMinDate = finalMinDate || defaultStart.toISOString().split("T")[0];
  }

  url.searchParams.set("start_date[min]", finalMinDate);
  url.searchParams.set("start_date[max]", finalMaxDate);

  return url.toString();
}

/**
 * Ingests a scraped page as a small pipeline:
 *
 *   parse → canonicalize → resolveEmbeddings → score → persist
 *
 * Ads are written once per `library_id`; relevance is written to the derived
 * `(query, ad)` relation. Any embedding-provider failure aborts the call with
 * `EmbeddingProviderError` before anything is persisted, so callers can fall
 * back to previously cached ads.
 */
export async function ingestScrapedAds(params: {
  searchQuery: string;
  rawMarkdown?: string;
  mediaByAnchor?: AnchoredMedia[];
  excludeIds?: Set<string>;
  embedder?: EmbeddingProvider;
}): Promise<{
  searchQuery: string;
  totalParsed: number;
  relavantAds: ScoredScrapedAd[];
}> {
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
    return { searchQuery, totalParsed: 0, relavantAds: [] };
  }

  // Stage 2: deterministic text + hashes.
  const canonicalCards = canonicalizeCardBatch(cards, mediaByAnchor);

  // Stage 3: reuse stored embeddings; embed each unique canonical text once.
  const existingAdsRes = await getScrapedAdsByIds(
    cards.map((card) => card.libraryId),
  );
  const existingAds: Map<string, ScrapedAd[]> =
    existingAdsRes.success && existingAdsRes.data
      ? existingAdsRes.data
      : new Map<string, ScrapedAd[]>();
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
    firstSeenAt: existingAds.get(scored.card.libraryId)?.[0]?.firstSeenAt ?? now,
    lastSeenAt: now,
  }));
  const relations: NewAdQueryRelevance[] = scoredCards.map((scored) => ({
    libraryId: scored.card.libraryId,
    searchQuery: searchQuery.trim(),
    relevanceScore: scored.relevanceScore,
    lastSeenAt: now,
  }));

  const persistRes = await persistScrapedAds(ads, relations);
  if (!persistRes.success) {
    throw new Error(persistRes.error || "Failed to persist scraped ads.");
  }

  const relavantAds: ScoredScrapedAd[] = scoredCards
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
    relavantAds,
  };
}
