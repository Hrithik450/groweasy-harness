/**
 * Meta Ad Library page parsing, URL construction, and the scraper storage
 * facade.
 *
 * The parser uses a loose Library-ID anchor so partially hydrated pages still
 * yield cards, with a strict pass replacing cards whose status line hydrated.
 *
 * @module @/lib/services/scraper/scraper.service
 */

import * as repo from "@/lib/repositories/scraper.repo";
import type { ScrapedAdCard } from "./pipeline";
import type {
  NewAdQueryRelevance,
  NewScrapedAd,
  ScoredScrapedAd,
  ScrapedAd,
} from "./types";
import { parseMetaAdDate } from "./utils";

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
  index: number;
  card: ScrapedAdCard;
}

/** Index of the next `Library ID:` anchor after `fromIndex`, or the end. */
function nextAnchorIndex(markdownText: string, fromIndex: number): number {
  const next = markdownText.indexOf("Library ID:", fromIndex);
  return next === -1 ? markdownText.length : next;
}

/** Strict pass: Meta's normal layout, status line immediately above the id. */
function parseAnchoredCards(markdownText: string): PositionedCard[] {
  const pattern =
    /^[ \t​‌‍﻿]*(Active|Inactive)[^\n]*\n(?:[ \t​‌‍﻿]*\n)*[ \t​‌‍﻿]*Library ID:\s*(\d+)/gim;
  const matches = Array.from(markdownText.matchAll(pattern));
  const parsedCards: PositionedCard[] = [];
  const seenIds = new Set<string>();

  for (const match of matches) {
    const libraryId = match[2];
    if (seenIds.has(libraryId)) continue;
    seenIds.add(libraryId);

    const startIndex = match.index ?? 0;
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
function parseLibraryIdAnchoredCards(markdownText: string): PositionedCard[] {
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
  longevityDays?: number;
  mediaType?: "all" | "image" | "video";
}): string {
  const {
    query,
    locale = "en_US",
    country = "IN",
    startDate,
    endDate,
    longevityDays = 30,
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
    defaultStart.setDate(now.getDate() - Math.max(1, longevityDays));
    finalMinDate = finalMinDate || defaultStart.toISOString().split("T")[0];
  }

  url.searchParams.set("start_date[min]", finalMinDate);
  url.searchParams.set("start_date[max]", finalMaxDate);

  return url.toString();
}

/**
 * Retrieves deduplicated relevant ads for a search query via the
 * `(query, ad)` relation table, best match first.
 */
export async function getAdsByQuery(
  searchQuery: string,
  excludeIds?: Set<string>,
  limit?: number,
  dateRange?: { startDate?: string; endDate?: string },
): Promise<ScoredScrapedAd[]> {
  return repo.getAdsByQuery(searchQuery, excludeIds, limit, dateRange);
}

/**
 * Retrieves scraped ads by their libraryIds in a single query.
 * Returns a Map where key is libraryId and value is the matching record list.
 */
export async function getScrapedAdsByIds(
  libraryIds: string[],
): Promise<Map<string, ScrapedAd[]>> {
  return repo.getScrapedAdsByIds(libraryIds);
}

/** Persists ad facts and per-query relevance rows in one transaction. */
export async function persistScrapedAds(
  ads: NewScrapedAd[],
  relations: NewAdQueryRelevance[],
): Promise<void> {
  repo.persistScrapedAds(ads, relations);
}
