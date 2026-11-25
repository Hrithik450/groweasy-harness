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
/** Searches at or below this count only ask "does this phrase have ads?". */
const VALIDATION_TARGET_COUNT = 2;
/** Validation scans stop after the first cards. */
const VALIDATION_SCROLL_STEPS = 3;
const MAX_MEDIA_CONCURRENCY = 3;

const EMPTY_MEDIA: { videos: string[]; images: string[] } = {
  videos: [],
  images: [],
};

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

interface CrawlDepth {
  maxScrollSteps: number;
  scrollDelay: number;
  delayBeforeSnapshot: number;
  pageTimeout: number;
}

/**
 * Per-search state, threaded through the phase methods instead of closed over.
 * `selected*` accumulates across the cache and both engines so a creative is
 * delivered once no matter which path found it.
 */
interface SearchContext {
  query: string;
  country: string;
  targetCount: number;
  mediaType: "all" | "image" | "video";
  startDate: string;
  endDate: string;
  excludeIds: ReadonlySet<string>;
  excludeHashes: ReadonlySet<string>;
  selectedIds: Set<string>;
  selectedHashes: Set<string>;
  cached: AdRecord[];
  /** targetCount minus what the cache provided. */
  shortage: number;
  fresh: AdRecord[];
  source: MetaAdLibrarySearchResult["source"];
  notice?: string;
  telemetry?: MetaAdLibrarySearchResult["telemetry"];
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

/** Bounded-concurrency map, so media uploads never run unbounded. */
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

export class MetaAdLibrary {
  private readonly store: AdStore;
  private readonly media: AdMediaStore;
  private readonly crawler: FallbackCrawler;
  private readonly graphql: MetaGraphQLFetcher;
  private readonly logger: MetaAdLibraryLogger;

  constructor(options: MetaAdLibraryOptions) {
    this.store = options.store;
    this.media = options.media;
    this.crawler = options.crawler;
    this.graphql = options.graphql;
    this.logger = options.logger ?? DEFAULT_LOGGER;
  }

  /** Cache → GraphQL → Crawl4AI fallback, then a filtered, capped result. */
  async search(
    params: MetaAdLibrarySearchParams,
  ): Promise<MetaAdLibrarySearchResult> {
    const context = this.buildContext(params);

    await this.searchFromCache(context);
    if (context.shortage > 0) {
      await this.searchViaGraphQL(context);
      if (context.fresh.length === 0) {
        await this.searchViaCrawler(context);
      }
      if (context.fresh.length === 0 && context.cached.length > 0) {
        context.notice =
          "The live scan was unavailable; these are previously verified ads.";
      }
    }

    return this.buildResult(context);
  }

  /** Validate arguments and open the per-search state. */
  private buildContext(params: MetaAdLibrarySearchParams): SearchContext {
    const query = params.query.trim();
    if (!query) throw new Error("A search query is required.");

    const country = (params.country?.trim() || "IN").toUpperCase();
    const targetCount = Math.max(
      1,
      Math.min(Math.floor(params.targetCount ?? 10), MAX_GRAPHQL_RESULTS),
    );
    const { startDate, endDate } = resolveDateRange({
      startDate: params.startDate,
      endDate: params.endDate,
    });

    return {
      query,
      country,
      targetCount,
      mediaType: params.mediaType ?? "all",
      startDate,
      endDate,
      excludeIds: params.excludeIds ?? new Set<string>(),
      excludeHashes: params.excludeHashes ?? new Set<string>(),
      selectedIds: new Set<string>(),
      selectedHashes: new Set<string>(),
      cached: [],
      shortage: targetCount,
      fresh: [],
      source: "cache",
    };
  }

  /** Served ads from the store's cache; everything here counts as selected. */
  private async searchFromCache(context: SearchContext): Promise<void> {
    const cached = (
      await this.store.findCached({
        query: context.query,
        excludeIds: context.excludeIds,
        targetCount: context.targetCount,
        startDate: context.startDate,
        endDate: context.endDate,
      })
    ).filter((ad) => this.isEligible(ad, context));

    context.cached = cached;
    context.shortage = Math.max(0, context.targetCount - cached.length);
    for (const ad of cached) this.markSelected(ad, context);
  }

  /** Primary path: the Ad Library page's own GraphQL payload. */
  private async searchViaGraphQL(context: SearchContext): Promise<void> {
    try {
      const fetchTarget = Math.min(
        MAX_GRAPHQL_RESULTS,
        context.shortage +
          context.excludeIds.size +
          context.excludeHashes.size +
          2,
      );
      const page = await this.graphql({
        query: context.query,
        country: context.country,
        startDate: context.startDate,
        endDate: context.endDate,
        mediaType: context.mediaType,
        targetCount: fetchTarget,
        pageTimeoutMs: resolveCrawlDepth(context.targetCount).pageTimeout,
        settleMs: context.targetCount <= VALIDATION_TARGET_COUNT ? 4000 : 6000,
        onTelemetry: (value) => {
          this.logger.info(
            `[meta.ad.library] graphql "${context.query}" ${context.country}: ` +
              `${value.ssrAds} ssr + ${value.requests} req · ` +
              `${value.bytes}B · ${value.totalMs}ms`,
          );
        },
      });

      const cards = page.ads.map((ad) => this.cardFromGraphQL(ad));
      const ingested = await this.ingestStored(context, cards);
      context.fresh = this.selectAds(ingested, context, context.shortage);
      if (context.fresh.length > 0) context.source = "graphql";
      context.telemetry = {
        ssrAds: page.telemetry.ssrAds,
        requests: page.telemetry.requests,
        bytes: page.telemetry.bytes,
        totalMs: page.telemetry.totalMs,
      };
    } catch (error) {
      this.logger.warn(
        `[meta.ad.library] GraphQL path failed for "${context.query}" ` +
          `(${errorMessage(error)}); falling back to Crawl4AI.`,
      );
    }
  }

  /** Fallback: Crawl4AI renders and scrolls; cards are parsed from markdown. */
  private async searchViaCrawler(context: SearchContext): Promise<void> {
    try {
      const depth = resolveCrawlDepth(context.targetCount);
      const crawled = await this.crawler.crawl({
        url: buildMetaAdLibraryUrl({
          query: context.query,
          country: context.country,
          startDate: context.startDate,
          endDate: context.endDate,
          mediaType: context.mediaType,
        }),
        maxScrollSteps: depth.maxScrollSteps,
        scrollDelay: depth.scrollDelay,
        delayBeforeSnapshot: depth.delayBeforeSnapshot,
        pageTimeout: depth.pageTimeout,
      });

      const mediaByAnchor = new Map(
        crawled.mediaByAnchor.map((group) => [group.anchor, group]),
      );
      const cards = parseMetaAdCards(crawled.markdown).map((card) => ({
        libraryId: card.libraryId,
        adUrl: card.adUrl,
        content: card.content,
        startDate: card.startDate,
        status: card.status,
        media: [],
        mediaSources: primarySources(
          mediaByAnchor.get(card.libraryId) ?? EMPTY_MEDIA,
        ),
      }));

      const ingested = await this.ingestStored(context, cards);
      context.fresh = this.selectAds(ingested, context, context.shortage);
      if (context.fresh.length > 0) context.source = "crawler";
    } catch (error) {
      this.logger.warn(
        `[meta.ad.library] Crawl4AI fallback failed for "${context.query}" ` +
          `(${errorMessage(error)}).`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Selection + assembly
  // ------------------------------------------------------------------

  /** Apply the date window, exclusions, dedupe and the requested media kind. */
  private isEligible(ad: AdRecord, context: SearchContext): boolean {
    if (
      ad.startDate &&
      (ad.startDate < context.startDate || ad.startDate > context.endDate)
    ) {
      return false;
    }
    if (
      ad.contentHash &&
      (context.excludeHashes.has(ad.contentHash) ||
        context.selectedHashes.has(ad.contentHash))
    ) {
      return false;
    }
    if (
      context.excludeIds.has(ad.libraryId) ||
      context.selectedIds.has(ad.libraryId)
    ) {
      return false;
    }
    if (
      context.mediaType !== "all" &&
      !ad.media.some((media) => media.kind === context.mediaType)
    ) {
      return false;
    }
    return true;
  }

  /** Take up to `limit` eligible ads, marking each as delivered. */
  private selectAds(
    ads: readonly AdRecord[],
    context: SearchContext,
    limit: number,
  ): AdRecord[] {
    const accepted: AdRecord[] = [];
    for (const ad of ads) {
      if (accepted.length >= limit) break;
      if (!this.isEligible(ad, context)) continue;
      this.markSelected(ad, context);
      accepted.push(ad);
    }
    return accepted;
  }

  private markSelected(ad: AdRecord, context: SearchContext): void {
    context.selectedIds.add(ad.libraryId);
    if (ad.contentHash) context.selectedHashes.add(ad.contentHash);
  }

  /** Store media, ingest, and return the scored ads. */
  private async ingestStored(
    context: SearchContext,
    cards: AdCardInput[],
  ): Promise<AdRecord[]> {
    const stored = await this.storeMedia(cards);
    return this.store.ingest({
      query: context.query,
      cards: stored,
      excludeIds: context.excludeIds,
    });
  }

  private buildResult(context: SearchContext): MetaAdLibrarySearchResult {
    return {
      query: context.query,
      country: context.country,
      startDate: context.startDate,
      endDate: context.endDate,
      ads: [...context.cached, ...context.fresh].slice(0, context.targetCount),
      excludeCount: context.excludeIds.size,
      notice: context.notice,
      source: context.source,
      telemetry: context.telemetry,
    };
  }

  // ------------------------------------------------------------------
  // Cards + media
  // ------------------------------------------------------------------

  private cardFromGraphQL(ad: GraphQLAd): AdCardInput {
    return {
      libraryId: ad.libraryId,
      adUrl: ad.adUrl,
      content: ad.content,
      startDate: ad.startDate,
      status: ad.status,
      media: [],
      mediaSources: primarySources(ad.media),
    };
  }

  /** Download + store each card's primary creative. Failures skip the asset. */
  private async storeMedia(cards: AdCardInput[]): Promise<AdCardInput[]> {
    return mapLimit(cards, MAX_MEDIA_CONCURRENCY, async (card) => {
      const media: AdMediaRef[] = [];
      for (const source of card.mediaSources ?? []) {
        try {
          const ref = await this.media.store(source);
          if (ref) media.push(ref);
        } catch (error) {
          this.logger.warn(
            `[meta.ad.library] media store failed for ${card.libraryId} ` +
              `(${source.kind}): ${errorMessage(error)}`,
          );
        }
      }
      return { ...card, media };
    });
  }
}
