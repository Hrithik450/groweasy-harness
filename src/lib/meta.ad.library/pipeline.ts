/**
 * Meta Ad Library search pipeline.
 *
 * Orchestration only: cache → GraphQL → Crawl4AI fallback → date/exclusion
 * filtering → durable media storage → ingest. Persistence, media storage and
 * crawling are injected, so this module has no harness imports and can be
 * published as a package.
 *
 * Media is downloaded and stored while the search runs; each emitted ad
 * carries `{ assetId, url }` refs, never a signed CDN URL. The model only has
 * to copy `media[].url` into the block.
 *
 * @module @/lib/meta.ad.library/pipeline
 */

import { resolveDateRange } from "./dates";
import { parseMetaAdCards } from "./parse";
import { buildMetaAdLibraryUrl } from "./urls";
import type {
  AdCardInput,
  AdMediaRef,
  AdMediaSource,
  AdRecord,
  AdStore,
  AdMediaStore,
  FallbackCrawler,
  GraphQLAd,
  MetaAdLibraryLogger,
  MetaAdLibrarySearchParams,
  MetaAdLibrarySearchResult,
  MetaGraphQLFetcher,
} from "./types";

/** GraphQL caps each search at 500 ads. */
const MAX_GRAPHQL_RESULTS = 500;
const VALIDATION_TARGET_COUNT = 2;
const VALIDATION_SCROLL_STEPS = 3;
const MAX_MEDIA_CONCURRENCY = 3;

const DEFAULT_LOGGER: MetaAdLibraryLogger = {
  info: (message) => console.info(message),
  warn: (message) => console.warn(message),
};

export interface MetaAdLibraryOptions {
  store: AdStore;
  media: AdMediaStore;
  crawler: FallbackCrawler;
  graphql: MetaGraphQLFetcher;
  logger?: MetaAdLibraryLogger;
}

export interface MetaAdLibrary {
  search(
    params: MetaAdLibrarySearchParams,
  ): Promise<MetaAdLibrarySearchResult>;
}

interface CrawlDepth {
  maxScrollSteps: number;
  scrollDelay: number;
  delayBeforeSnapshot: number;
  pageTimeout: number;
}

function resolveCrawlDepth(targetCount: number): CrawlDepth {
  if (targetCount <= VALIDATION_TARGET_COUNT) {
    return {
      maxScrollSteps: VALIDATION_SCROLL_STEPS,
      scrollDelay: 1.2,
      delayBeforeSnapshot: 1.2,
      pageTimeout: 45000,
    };
  }
  return {
    maxScrollSteps: 15,
    scrollDelay: 2.5,
    delayBeforeSnapshot: 3.5,
    pageTimeout: 90000,
  };
}

/** One primary creative per ad: HD video, else the original image. */
function primarySources(media: {
  videos: string[];
  images: string[];
}): AdMediaSource[] {
  if (media.videos.length > 0) {
    return [{ kind: "video", url: media.videos[0] }];
  }
  if (media.images.length > 0) {
    return [{ kind: "image", url: media.images[0] }];
  }
  return [];
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
  return results;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createMetaAdLibrary(
  options: MetaAdLibraryOptions,
): MetaAdLibrary {
  const logger = options.logger ?? DEFAULT_LOGGER;

  /** Download + store every raw ad's primary creative. */
  async function storeMedia(cards: AdCardInput[]): Promise<AdCardInput[]> {
    return mapLimit(cards, MAX_MEDIA_CONCURRENCY, async (card) => {
      const media: AdMediaRef[] = [];
      for (const source of card.mediaSources ?? []) {
        try {
          const ref = await options.media.store(source);
          if (ref) media.push(ref);
        } catch (error) {
          logger.warn(
            `[meta.ad.library] media store failed for ${card.libraryId} ` +
              `(${source.kind}): ${errorMessage(error)}`,
          );
        }
      }
      return { ...card, media };
    });
  }

  function toCard(raw: {
    libraryId: string;
    adUrl: string;
    content: string;
    startDate: string | null;
    status: "active" | "inactive";
    mediaSources: AdMediaSource[];
  }): AdCardInput {
    return {
      libraryId: raw.libraryId,
      adUrl: raw.adUrl,
      content: raw.content,
      startDate: raw.startDate,
      status: raw.status,
      media: [],
      mediaSources: raw.mediaSources,
    };
  }

  function fromGraphQL(ad: GraphQLAd): AdCardInput {
    return toCard({
      libraryId: ad.libraryId,
      adUrl: ad.adUrl,
      content: ad.content,
      startDate: ad.startDate,
      status: ad.status,
      mediaSources: primarySources(ad.media),
    });
  }

  async function search(
    params: MetaAdLibrarySearchParams,
  ): Promise<MetaAdLibrarySearchResult> {
    const query = params.query.trim();
    if (!query) throw new Error("A search query is required.");

    const country = (params.country?.trim() || "IN").toUpperCase();
    const targetCount = Math.max(
      1,
      Math.min(Math.floor(params.targetCount ?? 10), MAX_GRAPHQL_RESULTS),
    );
    const mediaType = params.mediaType ?? "all";
    const { startDate, endDate } = resolveDateRange({
      startDate: params.startDate,
      endDate: params.endDate,
    });
    const excludeIds = params.excludeIds ?? new Set<string>();
    const excludeHashes = params.excludeHashes ?? new Set<string>();

    const cached = (
      await options.store.findCached({
        query,
        excludeIds,
        targetCount,
        startDate,
        endDate,
      })
    ).filter(
      (ad) =>
        (!ad.contentHash || !excludeHashes.has(ad.contentHash)) &&
        (mediaType === "all" ||
          ad.media.some((media) => media.kind === mediaType)),
    );

    if (cached.length >= targetCount) {
      return {
        query,
        country,
        startDate,
        endDate,
        ads: cached.slice(0, targetCount),
        excludeCount: excludeIds.size,
        source: "cache",
      };
    }

    const selectedIds = new Set(cached.map((ad) => ad.libraryId));
    const selectedHashes = new Set(
      cached
        .map((ad) => ad.contentHash)
        .filter((hash): hash is string => typeof hash === "string"),
    );

    /** Apply the window, exclusions, dedupe and media-kind filter. */
    function accept(ads: AdRecord[], limit: number): AdRecord[] {
      const accepted: AdRecord[] = [];
      for (const ad of ads) {
        if (accepted.length >= limit) break;
        if (
          ad.startDate &&
          (ad.startDate < startDate || ad.startDate > endDate)
        ) {
          continue;
        }
        if (ad.contentHash) {
          if (
            excludeHashes.has(ad.contentHash) ||
            selectedHashes.has(ad.contentHash)
          ) {
            continue;
          }
        }
        if (excludeIds.has(ad.libraryId) || selectedIds.has(ad.libraryId)) {
          continue;
        }
        if (
          mediaType !== "all" &&
          !ad.media.some((media) => media.kind === mediaType)
        ) {
          continue;
        }
        selectedIds.add(ad.libraryId);
        if (ad.contentHash) selectedHashes.add(ad.contentHash);
        accepted.push(ad);
      }
      return accepted;
    }

    const shortage = targetCount - cached.length;
    let fresh: AdRecord[] = [];
    let source: MetaAdLibrarySearchResult["source"] = "cache";
    let notice: string | undefined;
    let telemetry: MetaAdLibrarySearchResult["telemetry"];

    // Primary: the page's own GraphQL payload.
    try {
      const fetchTarget = Math.min(
        MAX_GRAPHQL_RESULTS,
        shortage + excludeIds.size + excludeHashes.size + 2,
      );
      const page = await options.graphql({
        query,
        country,
        startDate,
        endDate,
        mediaType,
        targetCount: fetchTarget,
        pageTimeoutMs: resolveCrawlDepth(targetCount).pageTimeout,
        settleMs: targetCount <= VALIDATION_TARGET_COUNT ? 4000 : 6000,
        onTelemetry: (value) => {
          logger.info(
            `[meta.ad.library] graphql "${query}" ${country}: ` +
              `${value.ssrAds} ssr + ${value.requests} req · ` +
              `${value.bytes}B · ${value.totalMs}ms`,
          );
        },
      });

      const cards = await storeMedia(page.ads.map(fromGraphQL));
      const ingested = await options.store.ingest({
        query,
        cards,
        excludeIds,
      });
      fresh = accept(ingested, shortage);
      if (fresh.length > 0) source = "graphql";
      telemetry = {
        ssrAds: page.telemetry.ssrAds,
        requests: page.telemetry.requests,
        bytes: page.telemetry.bytes,
        totalMs: page.telemetry.totalMs,
      };
    } catch (error) {
      logger.warn(
        `[meta.ad.library] GraphQL path failed for "${query}" ` +
          `(${errorMessage(error)}); falling back to Crawl4AI.`,
      );
    }

    // Fallback: Crawl4AI markdown, only when GraphQL produced nothing usable.
    if (fresh.length === 0) {
      const targetUrl = buildMetaAdLibraryUrl({
        query,
        country,
        startDate,
        endDate,
        mediaType,
      });
      const depth = resolveCrawlDepth(targetCount);

      try {
        const crawled = await options.crawler.crawl({
          url: targetUrl,
          maxScrollSteps: depth.maxScrollSteps,
          scrollDelay: depth.scrollDelay,
          delayBeforeSnapshot: depth.delayBeforeSnapshot,
          pageTimeout: depth.pageTimeout,
        });

        const mediaByAnchor = new Map(
          crawled.mediaByAnchor.map((group) => [group.anchor, group]),
        );
        const cards = parseMetaAdCards(crawled.markdown).map((card) =>
          toCard({
            ...card,
            mediaSources: primarySources(
              mediaByAnchor.get(card.libraryId) ?? {
                videos: [],
                images: [],
              },
            ),
          }),
        );

        const ingested = await options.store.ingest({
          query,
          cards: await storeMedia(cards),
          excludeIds,
        });
        fresh = accept(ingested, shortage);
        if (fresh.length > 0) source = "crawler";
      } catch (error) {
        logger.warn(
          `[meta.ad.library] Crawl4AI fallback failed for "${query}" ` +
            `(${errorMessage(error)}).`,
        );
      }
    }

    if (fresh.length === 0 && cached.length > 0) {
      notice =
        "The live scan was unavailable; these are previously verified ads.";
    }

    return {
      query,
      country,
      startDate,
      endDate,
      ads: [...cached, ...fresh].slice(0, targetCount),
      excludeCount: excludeIds.size,
      notice,
      source,
      telemetry,
    };
  }

  return { search };
}
