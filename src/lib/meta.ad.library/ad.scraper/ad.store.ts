/**
 * Ad store: the scraper SQLite database behind the pipeline seam.
 *
 * Media refs only surface internal `/api/attachments/…` URLs. Legacy rows that
 * still hold signed CDN URLs expose no media (they expire; the next live scan
 * stores them properly).
 *
 * @module @/lib/meta.ad.library/ad.scraper/ad.store
 */

import { getAdsByQuery } from "@/lib/repositories/scraper.repo";
import { ingestScrapedAdCards } from "./ingestion.service";
import type { AnchoredMedia, ScoredScrapedAd } from "./types";
import {
  findSemanticallyCachedAds,
  invalidateSemanticCache,
} from "./semantic.cache.service";
import type { AdCardInput, AdMediaRef, AdRecord, AdStore } from "../types";

const INTERNAL_URL_RE = /^\/api\/attachments\/([A-Za-z0-9]+)$/;

function internalAssetId(url: string): string | null {
  return INTERNAL_URL_RE.exec(url)?.[1] ?? null;
}

function refsFromMedia(
  media: { videos: string[]; images: string[] } | null | undefined,
): AdMediaRef[] {
  const refs: AdMediaRef[] = [];
  for (const url of media?.videos ?? []) {
    const assetId = internalAssetId(url);
    if (assetId) refs.push({ kind: "video", assetId, url });
  }
  for (const url of media?.images ?? []) {
    const assetId = internalAssetId(url);
    if (assetId) refs.push({ kind: "image", assetId, url });
  }
  return refs;
}

function toAdRecord(ad: ScoredScrapedAd): AdRecord {
  return {
    libraryId: ad.libraryId,
    adUrl: ad.adUrl,
    content: ad.content,
    startDate: ad.startDate,
    status: ad.status === "inactive" ? "inactive" : "active",
    media: refsFromMedia(ad.media),
    contentHash: ad.contentHash,
    relevanceScore: ad.relevanceScore,
  };
}

export class ScraperAdStore implements AdStore {
  async findCached(params: {
    query: string;
    excludeIds: ReadonlySet<string>;
    targetCount: number;
    startDate: string;
    endDate: string;
  }): Promise<AdRecord[]> {
    const exact = getAdsByQuery(
      params.query,
      new Set(params.excludeIds),
      params.targetCount,
      { startDate: params.startDate, endDate: params.endDate },
    );
    if (exact.length >= params.targetCount) return exact.map(toAdRecord);

    // The exact-query rows fell short: reuse ads that answer this query
    // semantically (a paraphrase) instead of going live for the whole set.
    let semantic: ScoredScrapedAd[] = [];
    try {
      semantic = await findSemanticallyCachedAds({
        query: params.query,
        excludeIds: params.excludeIds,
        limit: params.targetCount - exact.length,
      });
    } catch {
      // Semantic lookup is an optimization; the live scan still follows.
    }

    const seen = new Set(exact.map((ad) => ad.libraryId));
    const merged = [
      ...exact,
      ...semantic.filter((ad) => !seen.has(ad.libraryId)),
    ].sort((a, b) => b.relevanceScore - a.relevanceScore);

    return merged.slice(0, params.targetCount).map(toAdRecord);
  }

  async ingest(params: {
    query: string;
    cards: AdCardInput[];
    excludeIds?: ReadonlySet<string>;
  }): Promise<AdRecord[]> {
    const mediaByAnchor: AnchoredMedia[] = params.cards
      .filter((card) => card.media.length > 0)
      .map((card) => ({
        anchor: card.libraryId,
        videos: card.media
          .filter((media) => media.kind === "video")
          .map((media) => media.url),
        images: card.media
          .filter((media) => media.kind === "image")
          .map((media) => media.url),
      }));

    const result = await ingestScrapedAdCards({
      searchQuery: params.query,
      cards: params.cards
        .filter((card) => !params.excludeIds?.has(card.libraryId))
        .map((card) => ({
          libraryId: card.libraryId,
          adUrl: card.adUrl,
          content: card.content,
          startDate: card.startDate,
          status: card.status,
        })),
      mediaByAnchor,
    });

    // Newly ingested ads must be visible to the next semantic lookup.
    invalidateSemanticCache();

    return result.relevantAds.map(toAdRecord);
  }
}
