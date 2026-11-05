/**
 * The scraper domain declaration: durable Meta Ad Library ad facts plus the
 * derived query↔ad relevance projection. The spec object is the single source
 * of the domain's identity, layout, and record schemas; the repository opens
 * this through `ctx.storageDomain` and never touches a backend directly.
 *
 * Two tables mirror the application's former Drizzle schema, reduced to the
 * columns the scraper services actually read or write:
 *
 * - `scraped_ads`, keyed by the Meta Ad Library id: one durable ad fact,
 *   independent of which searches happened to surface it.
 * - `ad_query_relevance`, keyed by `(libraryId, searchQuery)` encoded as a JSON
 *   pair: relevance is a property of the pair, not of the ad, so this table can
 *   be dropped and rebuilt from ads + search history.
 *
 * Embeddings are stored as plain JSON number arrays rather than `Float32Array`
 * because the medium is JSON; the repository converts at the boundary. The
 * default (single-document) layout matches the reference `schedule` domain.
 *
 * @module @openai-harness/scraper/src/spec
 */

import { z } from "zod";
import { defineDomain, domainTable } from "@openai-harness/storage-domain";

/**
 * Durable ad fact. `content` is the scraped card markdown used for display
 * (including media lines); `contentHash` hashes the canonicalized card text and
 * defines "the same ad version". Timestamps are Unix seconds.
 */
export const scrapedAdRecordSchema = z
  .object({
    libraryId: z.string(),
    adUrl: z.string(),
    content: z.string(),
    contentHash: z.string(),
    /** Embedding vector as JSON numbers; `null` when the ad was never embedded. */
    embedding: z.array(z.number()).nullable(),
    embeddingModel: z.string().nullable(),
    /** Hash of `embeddingModel + canonical text` the embedding was computed from. */
    embeddingHash: z.string().nullable(),
    startDate: z.string().nullable(),
    status: z.string(),
    firstSeenAt: z.number().int().nonnegative(),
    lastSeenAt: z.number().int().nonnegative(),
  })
  .strict();

/** One stored ad record; inferred from {@link scrapedAdRecordSchema}. */
export type ScrapedAdRecord = z.infer<typeof scrapedAdRecordSchema>;

/**
 * Derived query↔ad projection. Only the score is rewritten on rediscovery;
 * `firstSeenAt` is preserved and `lastSeenAt` refreshed.
 */
export const adQueryRelevanceRecordSchema = z
  .object({
    libraryId: z.string(),
    searchQuery: z.string(),
    relevanceScore: z.number(),
    firstSeenAt: z.number().int().nonnegative(),
    lastSeenAt: z.number().int().nonnegative(),
  })
  .strict();

/** One stored relevance record; inferred from {@link adQueryRelevanceRecordSchema}. */
export type AdQueryRelevanceRecord = z.infer<
  typeof adQueryRelevanceRecordSchema
>;

/**
 * Authoritative scraper storage. Malformed stored records reject opening the
 * domain: ad facts are authoritative, and the derived relevance table is
 * rebuilt from them rather than trusted blindly.
 */
export const scraperDomain = defineDomain({
  name: "scraper",
  version: 1,
  tables: {
    scraped_ads: domainTable<string, ScrapedAdRecord>(scrapedAdRecordSchema),
    ad_query_relevance:
      domainTable<string, AdQueryRelevanceRecord>(adQueryRelevanceRecordSchema),
  },
});
