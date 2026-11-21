/**
 * Meta Ad Library markdown parsing and search-URL construction.
 *
 * @module @/lib/services/scraper/scraper.service
 */

import type { ScrapedAdCard } from "./types";
import { parseMetaAdDate } from "./utils";

const LIBRARY_ID_RE = /Library ID:\s*(\d+)/g;

/** Meta appends labels after the status ("Active Low impression count"). */
function readStatus(before: string): "active" | "inactive" {
  const match = /(?:^|\n)[ \t]*(Active|Inactive)\b[^\n]*[ \t]*$/i.exec(before);
  return match !== null && match[1].toLowerCase() === "inactive"
    ? "inactive"
    : "active";
}

/**
 * Parses Meta Ad Library markdown into cards, one per `Library ID` anchor.
 *
 * Anchoring on the id alone (rather than on a hydrated status line) keeps
 * partially rendered pages usable; the status falls back to active because the
 * search URL only requests running ads.
 */
export function parseMetaAdCards(markdown: string): ScrapedAdCard[] {
  if (!markdown) return [];

  const anchors = Array.from(markdown.matchAll(LIBRARY_ID_RE));
  const seen = new Set<string>();
  const cards: ScrapedAdCard[] = [];

  anchors.forEach((match, i) => {
    const libraryId = match[1];
    if (seen.has(libraryId)) return;
    seen.add(libraryId);

    const start = match.index ?? 0;
    const end = anchors[i + 1]?.index ?? markdown.length;
    const chunk = markdown.slice(start, end).trim();
    const date = chunk.match(/Started running on ([^\n·]+)/i);

    cards.push({
      libraryId,
      adUrl: `https://www.facebook.com/ads/library/?id=${libraryId}`,
      content: chunk,
      startDate: date ? parseMetaAdDate(date[0]) : null,
      status: readStatus(markdown.slice(Math.max(0, start - 240), start)),
    });
  });

  return cards;
}

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

  const now = new Date();
  const max = endDate || now.toISOString().split("T")[0];
  const start = new Date(now);
  start.setDate(now.getDate() - Math.max(1, longevityDays));
  url.searchParams.set(
    "start_date[min]",
    startDate || start.toISOString().split("T")[0],
  );
  url.searchParams.set("start_date[max]", max);

  return url.toString();
}
