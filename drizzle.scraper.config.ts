import { defineConfig } from "drizzle-kit";

/** Scraper database: ad-library scrapes and their embeddings. */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema/scraper.ts",
  out: "./src/lib/drizzle/migrations-scraper",
  dbCredentials: {
    url: process.env.SCRAPER_DATABASE_PATH ?? "./data/groweasy-scraper.db",
  },
});
