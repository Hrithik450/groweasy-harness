/**
 * Public contracts for the Meta Ad Library pipeline.
 *
 * Media is stored while scraping, through the caller's existing asset store.
 * The card carries the resulting storage id + stable URL; `libraryId` remains
 * a separate attribute of the ad. The model never builds ids or URLs — it
 * copies the media URL that the tool result already contains.
 *
 * @module @/lib/meta.ad.library/types
 */

export type AdMediaKind = "video" | "image";

/** A creative already written to durable storage (R2/attachments). */
export interface AdMediaRef {
  kind: AdMediaKind;
  /** Storage id: content hash or attachment id returned by the store. */
  assetId: string;
  /** Stable URL the UI can render; never a signed CDN URL. */
  url: string;
  mimeType?: string | null;
  bytes?: number | null;
}

/** The raw signed URL Meta returned before it was stored. */
export interface AdMediaSource {
  kind: AdMediaKind;
  /** Signed Meta CDN URL; expired URLs cannot be stored later. */
  url: string;
}

/** One ad as the pipeline discovers it (media not stored yet). */
export interface RawAd {
  libraryId: string;
  /** Public Ad Library page; a Link target, not a media source. */
  adUrl: string;
  content: string;
  startDate: string | null;
  status: "active" | "inactive";
  mediaSources: AdMediaSource[];
}

/** One ad as the model and the UI consume it (media already stored). */
export interface AdRecord {
  /** Meta ad id, kept for the source link and dedupe only. */
  libraryId: string;
  adUrl: string;
  content: string;
  startDate: string | null;
  status: "active" | "inactive";
  /** Stored creatives. The model copies `url` into `Image`/`Video.src`. */
  media: AdMediaRef[];
  contentHash?: string;
  relevanceScore?: number;
}

export interface MetaAdLibrarySearchParams {
  query: string;
  country?: string;
  targetCount?: number;
  startDate?: string;
  endDate?: string;
  mediaType?: "all" | "image" | "video";
  /** Ad ids that must never be returned (saved research, in-flight). */
  excludeIds?: ReadonlySet<string>;
  /** Content hashes that must never be returned (same creative, new id). */
  excludeHashes?: ReadonlySet<string>;
}

export interface MetaAdLibrarySearchResult {
  query: string;
  country: string;
  startDate: string;
  endDate: string;
  ads: AdRecord[];
  excludeCount: number;
  notice?: string;
  source: "cache" | "graphql" | "crawler";
  telemetry?: {
    ssrAds?: number;
    requests?: number;
    bytes?: number;
    totalMs?: number;
  };
}

/** A card handed to the store for ingestion; media is already stored. */
export interface AdCardInput {
  libraryId: string;
  adUrl: string;
  content: string;
  startDate: string | null;
  status: "active" | "inactive";
  /** Stored creatives, copied into the card the model reads. */
  media: AdMediaRef[];
  /** Raw signed URLs, kept as provenance for the store. */
  mediaSources?: AdMediaSource[];
}

/**
 * Persistence seam. The harness adapter uses the scraper SQLite DB; another
 * consumer can implement this over its own storage.
 */
export interface AdStore {
  findCached(params: {
    query: string;
    excludeIds: ReadonlySet<string>;
    targetCount: number;
    startDate: string;
    endDate: string;
  }): Promise<AdRecord[]>;
  /** Persist cards + relevance; returns them in relevance order. */
  ingest(params: {
    query: string;
    cards: AdCardInput[];
    excludeIds?: ReadonlySet<string>;
  }): Promise<AdRecord[]>;
}

/**
 * Durable media seam. `store` downloads the signed source URL (if needed),
 * writes the bytes through the existing attachment/R2 system, and returns the
 * storage id + stable URL. Implementations must be content-addressed so the
 * same creative reuses one object.
 */
export interface AdMediaStore {
  store(source: AdMediaSource): Promise<AdMediaRef | null>;
}

/** Crawl4AI fallback seam (the harness passes its existing crawler). */
export interface FallbackCrawler {
  crawl(params: {
    url: string;
    maxScrollSteps: number;
    scrollDelay: number;
    delayBeforeSnapshot: number;
    pageTimeout: number;
  }): Promise<{
    markdown: string;
    mediaByAnchor: Array<{
      anchor: string;
      videos: string[];
      images: string[];
    }>;
  }>;
}

export interface MetaAdLibraryLogger {
  info(message: string): void;
  warn(message: string): void;
}

/** Media as the GraphQL page reports it (signed CDN URLs). */
export interface GraphQLAdMedia {
  videos: string[];
  images: string[];
}

export interface GraphQLAd {
  libraryId: string;
  adUrl: string;
  content: string;
  startDate: string | null;
  status: "active" | "inactive";
  media: GraphQLAdMedia;
}

export interface GraphQLPage {
  ads: GraphQLAd[];
  telemetry: {
    ssrAds: number;
    requests: number;
    bytes: number;
    totalMs: number;
    navigationMs?: number;
  };
}

/** Primary GraphQL path, injected so the package does not own a browser. */
export interface MetaGraphQLFetcher {
  (params: {
    query: string;
    country: string;
    startDate: string;
    endDate: string;
    mediaType: "all" | "image" | "video";
    targetCount: number;
    pageTimeoutMs: number;
    settleMs: number;
    onTelemetry?: (telemetry: GraphQLPage["telemetry"]) => void;
  }): Promise<GraphQLPage>;
}
