/**
 * Durable scraper reads and writes over the `scraper` storage domain.
 *
 * This replaces the application's Drizzle `scraper.repo.ts`. The repository
 * owns no medium: it receives the opened domain handle (from
 * `ctx.storageDomain.open(scraperDomain)`) and resolves the two declared table
 * handles. Reads come synchronously from the domain's authoritative in-memory
 * state; writes await the domain's per-record durability chain.
 *
 * As with the reference `schedule` package's host-bound store, a process-wide
 * default lets the application's existing free-function call sites keep working
 * without threading a handle through every tool. Host composition either loads
 * the plugin (`ctx.plugin(Scraper)`) or calls
 * {@link configureScraperRepository}. Tests and multi-tenant hosts can pass a
 * repository explicitly to `new ScraperRepository(domain)`.
 *
 * @module @openai-harness/scraper/src/repository
 */

import type { Domain, KvTable } from "@openai-harness/storage-domain";

import { EXACT_CACHE_MIN_SCORE } from "./policy";
import { rankAdsByEmbedding } from "./semantic-cache";
import { scraperDomain } from "./spec";
import type { AdQueryRelevanceRecord, ScrapedAdRecord } from "./spec";
import { normalizeQueryKey } from "./utils";
import type {
  NewAdQueryRelevance,
  NewScrapedAd,
  ScoredScrapedAd,
  ScrapedAd,
} from "./types";

type ScraperDomain = Domain<typeof scraperDomain>;

/**
 * Composite key for `(libraryId, searchQuery)`. JSON encoding is unambiguous
 * for arbitrary query text; the default single-document layout keeps keys
 * opaque.
 */
function relationKey(libraryId: string, searchQuery: string): string {
  return JSON.stringify([libraryId, searchQuery]);
}

/** Rehydrate the JSON-native embedding into the service-facing `Float32Array`. */
function toScrapedAd(record: ScrapedAdRecord): ScrapedAd {
  return {
    libraryId: record.libraryId,
    adUrl: record.adUrl,
    content: record.content,
    contentHash: record.contentHash,
    embedding:
      record.embedding === null ? null : new Float32Array(record.embedding),
    embeddingModel: record.embeddingModel,
    embeddingHash: record.embeddingHash,
    startDate: record.startDate,
    status: record.status,
    firstSeenAt: record.firstSeenAt,
    lastSeenAt: record.lastSeenAt,
  };
}

/** Store an embedding as plain JSON numbers. */
function toEmbedding(
  embedding: Float32Array | null | undefined,
): number[] | null {
  return embedding === null || embedding === undefined
    ? null
    : Array.from(embedding);
}

/** Reads and writes for the scraper domain's two tables. */
export class ScraperRepository {
  private readonly ads: KvTable<string, ScrapedAdRecord>;
  private readonly relations: KvTable<string, AdQueryRelevanceRecord>;

  /**
   * @param domain - The opened scraper domain, owned by the caller (typically
   * the plugin, which closes it through its effect disposer).
   */
  constructor(domain: ScraperDomain) {
    this.ads = domain.table("scraped_ads");
    this.relations = domain.table("ad_query_relevance");
  }

  /**
   * Retrieve scraped ads by their libraryIds in a single pass.
   * Returns a map keyed by libraryId, one entry per stored ad.
   */
  getScrapedAdsByIds(libraryIds: string[]): Map<string, ScrapedAd[]> {
    const map = new Map<string, ScrapedAd[]>();
    for (const libraryId of libraryIds) {
      const record = this.ads.get(libraryId);
      if (record !== undefined) map.set(libraryId, [toScrapedAd(record)]);
    }
    return map;
  }

  /**
   * Persist ads and their per-query relevance.
   *
   * `scraped_ads` is keyed by `libraryId`, so concurrent searches reuse the same
   * record (and embedding) instead of duplicating the ad.
   * `ad_query_relevance` is keyed by `(libraryId, searchQuery)`; only the score
   * is rewritten. `firstSeenAt` is preserved on both tables.
   */
  async persistScrapedAds(
    ads: NewScrapedAd[],
    relations: NewAdQueryRelevance[],
  ): Promise<void> {
    if (ads.length === 0 && relations.length === 0) return;
    const now = Math.floor(Date.now() / 1000);

    for (const ad of ads) {
      const existing = this.ads.get(ad.libraryId);
      await this.ads.put(ad.libraryId, {
        libraryId: ad.libraryId,
        adUrl: ad.adUrl,
        content: ad.content,
        contentHash: ad.contentHash,
        embedding: toEmbedding(ad.embedding),
        embeddingModel: ad.embeddingModel ?? null,
        embeddingHash: ad.embeddingHash ?? null,
        startDate: ad.startDate ?? null,
        status: ad.status ?? "active",
        firstSeenAt: existing?.firstSeenAt ?? ad.firstSeenAt ?? now,
        lastSeenAt: now,
      });
    }

    for (const relation of relations) {
      const searchQuery = relation.searchQuery.trim();
      const key = relationKey(relation.libraryId, searchQuery);
      const existing = this.relations.get(key);
      await this.relations.put(key, {
        libraryId: relation.libraryId,
        searchQuery,
        relevanceScore: relation.relevanceScore,
        firstSeenAt: existing?.firstSeenAt ?? relation.firstSeenAt ?? now,
        lastSeenAt: now,
      });
    }
  }

  /**
   * Mark ads and their query relations as seen again, refreshing `lastSeenAt`
   * on both tables. Missing records are left absent.
   */
  async touchScrapedAds(
    items: Array<{ libraryId: string; searchQuery: string }>,
  ): Promise<void> {
    if (items.length === 0) return;
    const now = Math.floor(Date.now() / 1000);

    for (const item of items) {
      const ad = this.ads.get(item.libraryId);
      if (ad !== undefined) {
        await this.ads.put(item.libraryId, { ...ad, lastSeenAt: now });
      }

      const searchQuery = item.searchQuery.trim();
      const key = relationKey(item.libraryId, searchQuery);
      const relation = this.relations.get(key);
      if (relation !== undefined) {
        await this.relations.put(key, { ...relation, lastSeenAt: now });
      }
    }
  }

  /**
   * Retrieve relevant ads for a search query by joining each ad to its
   * `(query, ad)` relation record. Relevance is read from the relation, never
   * from the ad itself. Filtering, exclusion, date range and ordering run in
   * memory over the domain's authoritative state.
   */
  getAdsByQuery(
    searchQuery: string,
    excludeIds?: Set<string>,
    limit?: number,
    dateRange?: { startDate?: string; endDate?: string },
  ): ScoredScrapedAd[] {
    // Compare normalized keys, not raw strings: casing, extra spaces, and
    // surrounding punctuation are noise, not different searches. Persisted
    // rows keep the query exactly as it was supplied.
    const queryKey = normalizeQueryKey(searchQuery);
    const results: ScoredScrapedAd[] = [];

    for (const [, relation] of this.relations.entries()) {
      if (normalizeQueryKey(relation.searchQuery) !== queryKey) continue;
      if (relation.relevanceScore < EXACT_CACHE_MIN_SCORE) continue;
      if (excludeIds !== undefined && excludeIds.has(relation.libraryId)) {
        continue;
      }

      const ad = this.ads.get(relation.libraryId);
      if (ad === undefined) continue;
      // Only ads running right now may reach the model. A stored row keeps the
      // status captured at crawl time, so an ad Meta has since stopped can
      // never be served as active.
      if (ad.status.trim().toLowerCase() !== "active") continue;

      // SQLite `startDate >= ?` / `<= ?` exclude NULL, so a missing launch date
      // fails an explicitly requested range.
      if (dateRange?.startDate !== undefined) {
        if (ad.startDate === null || ad.startDate < dateRange.startDate) {
          continue;
        }
      }
      if (dateRange?.endDate !== undefined) {
        if (ad.startDate === null || ad.startDate > dateRange.endDate) {
          continue;
        }
      }

      results.push({
        ...toScrapedAd(ad),
        relevanceScore: relation.relevanceScore,
      });
    }

    results.sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore || b.lastSeenAt - a.lastSeenAt,
    );

    return limit !== undefined && limit > 0 ? results.slice(0, limit) : results;
  }

  /**
   * Retrieve stored ads semantically close to a query embedding.
   *
   * Unlike {@link getAdsByQuery}, this does not consult the derived
   * `(query, ad)` relations at all: it scans the ad facts and scores each
   * comparable `embedding` against the supplied query vector. The repository
   * owns the Maps, so the scan stays here and the ranking rules live in
   * {@link rankAdsByEmbedding}.
   */
  getAdsByEmbedding(params: {
    queryVector: Float32Array;
    embeddingModel: string;
    excludeIds?: ReadonlySet<string>;
    limit?: number;
    dateRange?: { startDate?: string; endDate?: string };
    minScore?: number;
  }): ScoredScrapedAd[] {
    return rankAdsByEmbedding({
      ...params,
      ads: this.allScrapedAds(),
    });
  }

  /**
   * Whether any ad fact is stored.
   *
   * The semantic read embeds the query before it can score anything; with an
   * empty store that call is pure cost, and callers are about to crawl anyway.
   */
  hasScrapedAds(): boolean {
    for (const _ of this.ads.entries()) return true;
    return false;
  }

  /** Iterate the durable ad facts through the service-facing shape. */
  private *allScrapedAds(): IterableIterator<ScrapedAd> {
    for (const [, record] of this.ads.entries()) {
      yield toScrapedAd(record);
    }
  }
}

/** Repository bound by {@link configureScraperRepository}, if any. */
let defaultRepository: ScraperRepository | undefined;

/**
 * Bind a repository as the default for the package's free-function services.
 * Host composition calls this once, after opening the domain.
 * @param repository - The repository over the host's opened scraper domain.
 */
export function configureScraperRepository(
  repository: ScraperRepository,
): void {
  defaultRepository = repository;
}

/** Whether host composition already bound a default repository. */
export function hasScraperRepository(): boolean {
  return defaultRepository !== undefined;
}

/**
 * Resolve the configured default repository or explain why there is none.
 * @internal Exported for the free-function service wrappers and the plugin.
 */
export function requireScraperRepository(): ScraperRepository {
  if (defaultRepository === undefined) {
    throw new Error(
      "Scraper service has no repository: load the @openai-harness/scraper plugin or call configureScraperRepository() during host composition.",
    );
  }
  return defaultRepository;
}

/**
 * Release a default binding on plugin disposal. A repository another host
 * bound later is left untouched.
 * @param repository - The repository whose binding is being released.
 */
export function releaseScraperRepository(
  repository: ScraperRepository,
): void {
  if (defaultRepository === repository) defaultRepository = undefined;
}
