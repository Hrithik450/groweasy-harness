/**
 * Meta Ad Library pipeline — public surface.
 *
 * Storage-agnostic: the harness wires its SQLite store, attachment/R2 media
 * store, Crawl4AI fallback and page-GraphQL fetcher in
 * `./adapters/*`; another consumer can swap all four.
 *
 * @module @/lib/meta.ad.library
 */

export * from "./types";
export { MetaAdLibrary, type MetaAdLibraryOptions } from "./pipeline";
export { buildMetaAdLibraryUrl } from "./urls";
export {
  parseMetaAdCards,
  parseMetaAdDate,
  type ParsedAdCard,
} from "./parse";
export { isValidDateString, resolveDateRange } from "./dates";
export {
  fetchMetaAdsViaGraphQL,
  MetaGraphQLUnavailableError,
  type MetaAdRecord,
  type MetaFetchTelemetry,
  type MetaSearchResult,
} from "./graphql";
