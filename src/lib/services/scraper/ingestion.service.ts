import {
  computeContentHash,
  getScrapedAdsByIds,
  parseMetaAdCards,
  touchScrapedAds,
  upsertScrapedAds,
  type ScrapedAd,
} from "./scraper.service";
import {
  dotProduct,
  getBatchEmbeddings,
  getEmbedding,
} from "./ad.relevance.service";
import type { ScrapedAdRecord } from "@/lib/db";

export interface RawScrapedAdCard {
  libraryId: string;
  adUrl: string;
  content: string;
  startDate?: string;
  status: string;
}

export type IngestionAdStatus =
  | "new_ad"
  | "updated_variant"
  | "unchanged_duplicate"
  | "already_analyzed"
  | "filtered_noise";

export interface ProcessedAdItem {
  libraryId: string;
  adUrl: string;
  content: string;
  startDate?: string;
  status: string;
  relevanceScore: number;
  contentHash: string;
  ingestionStatus: IngestionAdStatus;
  deduplicated: boolean;
}

export interface IngestAdsOptions {
  searchQuery: string;
  rawMarkdown?: string;
  minRelevanceThreshold?: number; // Default: 0.50
  analyzedAdIds?: Set<string>; // Ad IDs already reviewed/saved in competitor research memory
}

export interface IngestResult {
  searchQuery: string;
  totalParsed: number;
  newAdsCount: number;
  updatedVariantsCount: number;
  alreadyAnalyzedCount: number;
  deduplicatedCount: number;
  noiseFilteredCount: number;
  acceptedAds: ProcessedAdItem[];
  allProcessed: ProcessedAdItem[];
}

/** Normalize a parsed DB-shaped card into the ingestion card shape. */
function toRawCard(card: ScrapedAd): RawScrapedAdCard {
  return {
    libraryId: card.libraryId,
    adUrl: card.adUrl,
    content: card.content,
    startDate: card.startDate ?? undefined,
    status: card.status ?? "active",
  };
}

/**
 * End-to-end ingestion pipeline:
 * 1. Checks libraryId and SHA-256 contentHash of the complete ad card for deduplication / update detection.
 * 2. Runs the semantic relevance model for new or changed cards.
 * 3. Persists records to data/groweasy-scraper.db (scraped_ads) with zero joins.
 */
export async function ingestScrapedAds(
  options: IngestAdsOptions,
): Promise<IngestResult> {
  const {
    searchQuery,
    rawMarkdown,
    minRelevanceThreshold = 0.5,
    analyzedAdIds,
  } = options;

  const cards = rawMarkdown ? parseMetaAdCards(rawMarkdown).map(toRawCard) : [];
  const allProcessed: ProcessedAdItem[] = [];
  const toUpsert: ScrapedAdRecord[] = [];

  interface PendingScore {
    card: RawScrapedAdCard;
    contentHash: string;
    createdAt: number;
    wasKnown: boolean;
  }

  const adsMapRes = await getScrapedAdsByIds(
    cards.map((card) => card.libraryId),
  );
  const adsMap = adsMapRes.data ?? new Map<string, ScrapedAdRecord[]>();
  const now = Math.floor(Date.now() / 1000);
  const pendingScores: PendingScore[] = [];

  for (const card of cards) {
    const contentHash = computeContentHash(card.content);
    const existingList = adsMap.get(card.libraryId);
    const existingAd = existingList?.find(
      (record) => record.contentHash === contentHash,
    );
    const wasKnown = Boolean(existingList && existingList.length > 0);
    const createdAt = existingList?.[0]?.createdAt ?? now;

    // 1. Check if ad was already presented/saved in competitor research memory
    if (analyzedAdIds?.has(card.libraryId) && existingAd) {
      // Hash unchanged -> Already analyzed in competitor research report! Skip!
      allProcessed.push({
        libraryId: card.libraryId,
        adUrl: existingAd.adUrl || card.adUrl,
        content: existingAd.content || card.content,
        startDate: existingAd.startDate ?? card.startDate,
        status: existingAd.status ?? "active",
        relevanceScore: existingAd.relevanceScore,
        contentHash,
        ingestionStatus: "already_analyzed",
        deduplicated: true,
      });
      continue;
    }

    if (existingAd) {
      // 2. Existing ad known for this query with an unchanged hash.
      // Low relevance was already noise -> skip the embedding model!
      if (existingAd.relevanceScore < minRelevanceThreshold) {
        allProcessed.push({
          libraryId: card.libraryId,
          adUrl: existingAd.adUrl || card.adUrl,
          content: existingAd.content || card.content,
          startDate: existingAd.startDate ?? card.startDate,
          status: existingAd.status ?? "active",
          relevanceScore: existingAd.relevanceScore,
          contentHash,
          ingestionStatus: "filtered_noise",
          deduplicated: true,
        });
        continue;
      }

      // Relevant unchanged ad -> bump timestamp and skip re-scoring
      await touchScrapedAds([{ libraryId: card.libraryId, searchQuery }]);
      allProcessed.push({
        libraryId: card.libraryId,
        adUrl: existingAd.adUrl || card.adUrl,
        content: existingAd.content || card.content,
        startDate: existingAd.startDate ?? card.startDate,
        status: existingAd.status ?? "active",
        relevanceScore: existingAd.relevanceScore,
        contentHash,
        ingestionStatus: "unchanged_duplicate",
        deduplicated: true,
      });
      continue;
    }

    // 3. New ad, or an existing ad whose content hash changed -> score it.
    pendingScores.push({ card, contentHash, createdAt, wasKnown });
  }

  if (pendingScores.length > 0) {
    const [queryVec, embeddings] = await Promise.all([
      getEmbedding(searchQuery),
      getBatchEmbeddings(
        pendingScores.map(({ card }) => card.content),
        20,
      ),
    ]);

    pendingScores.forEach(
      ({ card, contentHash, createdAt, wasKnown }, index) => {
        const relevance = dotProduct(queryVec, embeddings[index]);
        toUpsert.push(
          buildRecord(card, searchQuery, contentHash, relevance, createdAt),
        );

        const isRelevant = relevance >= minRelevanceThreshold;
        allProcessed.push({
          libraryId: card.libraryId,
          adUrl: card.adUrl,
          content: card.content,
          startDate: card.startDate,
          status: card.status || "active",
          relevanceScore: relevance,
          contentHash,
          ingestionStatus: isRelevant
            ? wasKnown
              ? "updated_variant"
              : "new_ad"
            : "filtered_noise",
          deduplicated: false,
        });
      },
    );
  }

  if (toUpsert.length > 0) {
    await upsertScrapedAds(toUpsert);
  }

  // Filter accepted ads (new or updated variants that passed relevance threshold)
  const acceptedAds = allProcessed.filter(
    (a) =>
      (a.ingestionStatus === "new_ad" ||
        a.ingestionStatus === "updated_variant") &&
      a.relevanceScore >= minRelevanceThreshold,
  );

  // Sort accepted ads by relevance score descending
  acceptedAds.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return {
    searchQuery,
    totalParsed: cards.length,
    newAdsCount: allProcessed.filter((a) => a.ingestionStatus === "new_ad")
      .length,
    updatedVariantsCount: allProcessed.filter(
      (a) => a.ingestionStatus === "updated_variant",
    ).length,
    alreadyAnalyzedCount: allProcessed.filter(
      (a) => a.ingestionStatus === "already_analyzed",
    ).length,
    deduplicatedCount: allProcessed.filter((a) => a.deduplicated).length,
    noiseFilteredCount: allProcessed.filter(
      (a) => a.ingestionStatus === "filtered_noise",
    ).length,
    acceptedAds,
    allProcessed,
  };
}

/** Build a fully-populated scraped-ad row for an upsert. */
function buildRecord(
  card: RawScrapedAdCard,
  searchQuery: string,
  contentHash: string,
  relevanceScore: number,
  createdAt: number,
): ScrapedAdRecord {
  return {
    libraryId: card.libraryId,
    searchQuery,
    adUrl: card.adUrl,
    content: card.content,
    contentHash,
    relevanceScore,
    startDate: card.startDate ?? null,
    status: card.status || "active",
    createdAt,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}
