import { eq, and, gte, desc, notInArray } from "drizzle-orm";
import {
  scraperDb,
  scrapedAds,
  type ScrapedAdRecord,
  type NewScrapedAdRecord,
} from "@/lib/db";

export type { ScrapedAdRecord, NewScrapedAdRecord };

/** Retrieve a scraped ad record by libraryId. */
export function getScrapedAd(
  libraryId: string,
): ScrapedAdRecord | undefined {
  return scraperDb
    .select()
    .from(scrapedAds)
    .where(eq(scrapedAds.libraryId, libraryId))
    .limit(1)
    .get();
}

/**
 * Insert or update a scraped ad with its relevance score for a search query.
 */
export function upsertScrapedAd(ad: NewScrapedAdRecord): void {
  const now = Math.floor(Date.now() / 1000);
  scraperDb
    .insert(scrapedAds)
    .values({
      libraryId: ad.libraryId,
      searchQuery: ad.searchQuery.trim(),
      adUrl: ad.adUrl,
      content: ad.content,
      contentHash: ad.contentHash,
      relevanceScore: ad.relevanceScore,
      startDate: ad.startDate ?? null,
      status: ad.status ?? "active",
      createdAt: ad.createdAt ?? now,
      updatedAt: ad.updatedAt ?? now,
    })
    .onConflictDoUpdate({
      target: [scrapedAds.libraryId],
      set: {
        searchQuery: ad.searchQuery.trim(),
        adUrl: ad.adUrl,
        content: ad.content,
        contentHash: ad.contentHash,
        relevanceScore: ad.relevanceScore,
        startDate: ad.startDate ?? null,
        status: ad.status ?? "active",
        updatedAt: now,
      },
    })
    .run();
}

/**
 * Updates the updatedAt timestamp when an ad is seen again unchanged (still active).
 */
export function touchScrapedAd(libraryId: string, searchQuery: string): void {
  const now = Math.floor(Date.now() / 1000);
  scraperDb
    .update(scrapedAds)
    .set({ searchQuery: searchQuery.trim(), updatedAt: now })
    .where(eq(scrapedAds.libraryId, libraryId))
    .run();
}

/**
 * Retrieve deduplicated relevant ads for a search query (relevanceScore >= 0.50).
 * Natively pushes NOT IN (excludeIds) and LIMIT down into the SQLite engine.
 */
export function getAdsByQuery(
  searchQuery: string,
  excludeIds?: Set<string>,
  limit?: number,
): ScrapedAdRecord[] {
  const conditions = [
    eq(scrapedAds.searchQuery, searchQuery.trim()),
    gte(scrapedAds.relevanceScore, 0.5),
  ];

  if (excludeIds && excludeIds.size > 0) {
    conditions.push(notInArray(scrapedAds.libraryId, Array.from(excludeIds)));
  }

  const query = scraperDb
    .select()
    .from(scrapedAds)
    .where(and(...conditions))
    .orderBy(desc(scrapedAds.relevanceScore), desc(scrapedAds.updatedAt));

  return (limit && limit > 0 ? query.limit(limit) : query).all();
}
