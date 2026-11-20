import {
  text,
  integer,
  real,
  sqliteTable,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";

/**
 * One durable Meta Ad Library ad fact, keyed by the ad's library id.
 *
 * `embedding` stores the vector as JSON numbers (text) so the scraper database
 * stays a plain SQLite file; the repository converts at the boundary.
 */
export const scrapedAds = sqliteTable(
  "scraped_ads",
  {
    libraryId: text("library_id").primaryKey(),
    adUrl: text("ad_url").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    /** JSON-encoded `number[]`, or null when the ad was never embedded. */
    embedding: text("embedding"),
    embeddingModel: text("embedding_model"),
    /** Hash of `embedding_model + canonical text` that produced the embedding. */
    embeddingHash: text("embedding_hash"),
    startDate: text("start_date"),
    status: text("status").notNull().default("active"),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (table) => [index("idx_scraped_ads_last_seen").on(table.lastSeenAt)],
);

/**
 * Derived `(query, ad)` relevance projection.
 *
 * Relevance is a property of the pair, not of the ad: the same ad can answer
 * many queries. Only the score is rewritten on rediscovery; `first_seen_at` is
 * preserved and `last_seen_at` refreshed.
 */
export const adQueryRelevance = sqliteTable(
  "ad_query_relevance",
  {
    libraryId: text("library_id")
      .notNull()
      .references(() => scrapedAds.libraryId, { onDelete: "cascade" }),
    searchQuery: text("search_query").notNull(),
    relevanceScore: real("relevance_score").notNull(),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.libraryId, table.searchQuery] }),
    index("idx_ad_query_relevance_query_score").on(
      table.searchQuery,
      table.relevanceScore,
    ),
  ],
);
