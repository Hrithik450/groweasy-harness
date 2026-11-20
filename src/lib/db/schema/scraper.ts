import {
  text,
  integer,
  real,
  sqliteTable,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";

export const scrapedAds = sqliteTable(
  "scraped_ads",
  {
    libraryId: text("library_id").notNull(),
    /** Last search query that found this ad; cache lookup key, not identity. */
    searchQuery: text("search_query").notNull(),
    adUrl: text("ad_url").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    relevanceScore: real("relevance_score").notNull(),
    startDate: text("start_date"),
    status: text("status").default("active"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    primaryKey({ columns: [table.libraryId] }),
    index("idx_scraped_ads_query").on(table.searchQuery, table.relevanceScore),
  ],
);
