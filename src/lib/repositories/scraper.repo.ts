import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
} from "drizzle-orm";
import {
  scraperDb,
  scrapedAds,
  adQueryRelevance,
  type AdQueryRelevanceRecord,
  type NewAdQueryRelevanceRecord,
  type NewScrapedAdRecord,
  type ScrapedAdRecord,
} from "@/lib/db";
import { EXACT_CACHE_MIN_SCORE } from "@/lib/services/scraper/policy";
import { normalizeQueryKey } from "@/lib/services/scraper/utils";
import type {
  NewAdQueryRelevance,
  NewScrapedAd,
  ScoredScrapedAd,
  ScrapedAd,
} from "@/lib/services/scraper/types";

export type { ScrapedAdRecord, NewScrapedAdRecord };

/** Rehydrate the JSON-native embedding into the service-facing `Float32Array`. */
function toScrapedAd(row: ScrapedAdRecord): ScrapedAd {
  let embedding: Float32Array | null = null;
  if (row.embedding !== null) {
    try {
      const parsed: unknown = JSON.parse(row.embedding);
      if (Array.isArray(parsed))
        embedding = new Float32Array(parsed as number[]);
    } catch {
      embedding = null;
    }
  }
  return {
    libraryId: row.libraryId,
    adUrl: row.adUrl,
    content: row.content,
    contentHash: row.contentHash,
    embedding,
    embeddingModel: row.embeddingModel,
    embeddingHash: row.embeddingHash,
    media: row.media ?? null,
    startDate: row.startDate,
    status: row.status,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
  };
}

/** Store an embedding as plain JSON numbers. */
function toEmbedding(
  embedding: Float32Array | null | undefined,
): string | null {
  return embedding === null || embedding === undefined
    ? null
    : JSON.stringify(Array.from(embedding));
}

/** Retrieve scraped ads by libraryId, one row per id (the primary key). */
export function getScrapedAdsByIds(
  libraryIds: string[],
): Map<string, ScrapedAd> {
  const data = new Map<string, ScrapedAd>();
  const ids = [...new Set(libraryIds)];
  if (ids.length === 0) return data;

  const records = scraperDb
    .select()
    .from(scrapedAds)
    .where(inArray(scrapedAds.libraryId, ids))
    .all();

  for (const record of records) {
    data.set(record.libraryId, toScrapedAd(record));
  }
  return data;
}

export function persistScrapedAds(
  ads: NewScrapedAd[],
  relations: NewAdQueryRelevance[],
): void {
  if (ads.length === 0 && relations.length === 0) return;
  const now = Math.floor(Date.now() / 1000);

  scraperDb.transaction((tx) => {
    for (const ad of ads) {
      const row: NewScrapedAdRecord = {
        libraryId: ad.libraryId,
        adUrl: ad.adUrl,
        content: ad.content,
        contentHash: ad.contentHash,
        embedding: toEmbedding(ad.embedding),
        embeddingModel: ad.embeddingModel ?? null,
        embeddingHash: ad.embeddingHash ?? null,
        media: ad.media ?? null,
        startDate: ad.startDate ?? null,
        status: ad.status ?? "active",
        firstSeenAt: ad.firstSeenAt ?? now,
        lastSeenAt: now,
      };
      tx.insert(scrapedAds)
        .values(row)
        .onConflictDoUpdate({
          target: [scrapedAds.libraryId],
          set: {
            adUrl: row.adUrl,
            content: row.content,
            contentHash: row.contentHash,
            embedding: row.embedding,
            embeddingModel: row.embeddingModel,
            embeddingHash: row.embeddingHash,
            media: row.media,
            startDate: row.startDate,
            status: row.status,
            lastSeenAt: now,
          },
        })
        .run();
    }

    for (const relation of relations) {
      const row: NewAdQueryRelevanceRecord = {
        libraryId: relation.libraryId,
        searchQuery: normalizeQueryKey(relation.searchQuery),
        relevanceScore: relation.relevanceScore,
        firstSeenAt: relation.firstSeenAt ?? now,
        lastSeenAt: now,
      };
      tx.insert(adQueryRelevance)
        .values(row)
        .onConflictDoUpdate({
          target: [adQueryRelevance.libraryId, adQueryRelevance.searchQuery],
          set: {
            lastSeenAt: now,
            relevanceScore: row.relevanceScore,
          },
        })
        .run();
    }
  });
}

/**
 * Retrieve relevant ads for a search query by joining each ad to its
 * `(query, ad)` relation row. Relevance comes from the relation, never from
 * the ad. Filters, ordering and limit run in SQLite.
 */
export function getAdsByQuery(
  searchQuery: string,
  excludeIds?: Set<string>,
  limit?: number,
  dateRange?: { startDate?: string; endDate?: string },
): ScoredScrapedAd[] {
  const conditions = [
    eq(adQueryRelevance.searchQuery, normalizeQueryKey(searchQuery)),
    gte(adQueryRelevance.relevanceScore, EXACT_CACHE_MIN_SCORE),
    eq(scrapedAds.status, "active"),
  ];

  if (excludeIds && excludeIds.size > 0) {
    conditions.push(
      notInArray(adQueryRelevance.libraryId, Array.from(excludeIds)),
    );
  }

  // Match the previous service: a missing launch date stays eligible even when
  // an explicit window was requested.
  if (dateRange?.startDate !== undefined) {
    conditions.push(
      or(
        isNull(scrapedAds.startDate),
        gte(scrapedAds.startDate, dateRange.startDate),
      )!,
    );
  }
  if (dateRange?.endDate !== undefined) {
    conditions.push(
      or(
        isNull(scrapedAds.startDate),
        lte(scrapedAds.startDate, dateRange.endDate),
      )!,
    );
  }

  const rows = scraperDb
    .select({
      ad: scrapedAds,
      relevanceScore: adQueryRelevance.relevanceScore,
    })
    .from(adQueryRelevance)
    .innerJoin(scrapedAds, eq(adQueryRelevance.libraryId, scrapedAds.libraryId))
    .where(and(...conditions))
    .orderBy(desc(adQueryRelevance.relevanceScore), desc(scrapedAds.lastSeenAt))
    .all();

  const results = rows.map(({ ad, relevanceScore }) => ({
    ...toScrapedAd(ad),
    relevanceScore,
  }));

  return limit !== undefined && limit > 0 ? results.slice(0, limit) : results;
}
