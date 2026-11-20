import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import * as repo from "@/lib/repositories/scraper.repo";
import { scraperDb, scrapedAds } from "@/lib/db";
import type { Response } from "../types";
import type { NewScrapedAdRecord, ScrapedAdRecord } from "@/lib/db";

export type { NewScrapedAdRecord, ScrapedAdRecord };

/** The fields parsed out of one Meta Ad Library card. */
export type ScrapedAd = Pick<
  ScrapedAdRecord,
  "libraryId" | "adUrl" | "content" | "startDate" | "status"
>;

/**
 * Retrieves deduplicated relevant ads for a search query, with native SQLite exclusion and limit.
 */
export async function getAdsByQuery(
  searchQuery: string,
  excludeIds?: Set<string>,
  limit?: number,
  dateRange?: { startDate?: string; endDate?: string },
): Promise<Response<ScrapedAdRecord[]>> {
  try {
    const rows = repo.getAdsByQuery(
      searchQuery,
      excludeIds,
      limit && limit > 0 ? limit * 3 : undefined,
    );
    const inWindow = dateRange
      ? rows.filter((row) => {
          if (!row.startDate) return true;
          if (dateRange.startDate && row.startDate < dateRange.startDate) {
            return false;
          }
          if (dateRange.endDate && row.startDate > dateRange.endDate) {
            return false;
          }
          return true;
        })
      : rows;
    const data = limit && limit > 0 ? inWindow.slice(0, limit) : inWindow;
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves scraped ads by their libraryIds in a single query.
 * Returns a Map where key is libraryId and value is the list of matching records.
 */
export async function getScrapedAdsByIds(
  libraryIds: string[],
): Promise<Response<Map<string, ScrapedAdRecord[]>>> {
  try {
    const ids = [...new Set(libraryIds)];
    const data = new Map<string, ScrapedAdRecord[]>();
    if (ids.length === 0) return { success: true, data };

    const records = scraperDb
      .select()
      .from(scrapedAds)
      .where(inArray(scrapedAds.libraryId, ids))
      .all();

    for (const record of records) {
      const recordsForId = data.get(record.libraryId) ?? [];
      recordsForId.push(record);
      data.set(record.libraryId, recordsForId);
    }
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Inserts or updates scraped ad records (single or multiple).
 */
export async function upsertScrapedAds(
  records: NewScrapedAdRecord[],
): Promise<Response<void>> {
  try {
    for (const record of records) repo.upsertScrapedAd(record);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Updates the updatedAt timestamp for ads (single or multiple).
 */
export async function touchScrapedAds(
  items: Array<{ libraryId: string; searchQuery: string }>,
): Promise<Response<void>> {
  try {
    for (const item of items) {
      repo.touchScrapedAd(item.libraryId, item.searchQuery);
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Computes an O(1) SHA-256 content hash of the complete ad card markdown/text.
 */
export function computeContentHash(content: string): string {
  return crypto
    .createHash("sha256")
    .update((content || "").trim())
    .digest("hex");
}

/**
 * Parses raw scraped Meta Ad Library markdown text into complete individual ad card blocks.
 */
export function parseMetaAdCards(markdownText: string): ScrapedAd[] {
  if (!markdownText || typeof markdownText !== "string") return [];

  const pattern = /(Active|Inactive)\s*\n\s*Library ID:\s*(\d+)/gi;
  const matches = Array.from(markdownText.matchAll(pattern));
  const parsedCards: ScrapedAd[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const startIndex = match.index ?? 0;
    const nextStartIndex =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? markdownText.length)
        : markdownText.length;

    const chunk = markdownText.slice(startIndex, nextStartIndex).trim();
    const status = match[1].toLowerCase() === "active" ? "active" : "inactive";
    const libraryId = match[2];
    const adUrl = `https://www.facebook.com/ads/library/?id=${libraryId}`;

    const dateMatch = chunk.match(/Started running on ([^\n]+)/i);
    const startDate = dateMatch ? dateMatch[0].trim() : null;

    parsedCards.push({
      libraryId,
      adUrl,
      content: chunk,
      startDate,
      status,
    });
  }

  return parsedCards;
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
