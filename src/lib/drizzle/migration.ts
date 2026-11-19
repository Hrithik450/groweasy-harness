import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "groweasy.db");
const scraperDbPath =
  process.env.SCRAPER_DATABASE_PATH || path.join(dataDir, "groweasy-scraper.db");

async function main() {
  // 1. Migrate Main Harness Database
  console.log(
    `[Drizzle] Applying migrations from ./src/lib/drizzle/migrations to ${dbPath}...`,
  );
  const harnessClient = new Database(dbPath);
  harnessClient.pragma("journal_mode = WAL");
  harnessClient.pragma("foreign_keys = ON");
  await migrate(drizzle(harnessClient), {
    migrationsFolder: "./src/lib/drizzle/migrations",
  });
  harnessClient.close();
  console.log("[Drizzle] groweasy.db migrations applied successfully.");

  // 2. Migrate Scraper Database
  console.log(
    `[Drizzle] Applying migrations from ./src/lib/drizzle/migrations-scraper to ${scraperDbPath}...`,
  );
  const scraperClient = new Database(scraperDbPath);
  scraperClient.pragma("journal_mode = WAL");
  scraperClient.pragma("foreign_keys = ON");
  await migrate(drizzle(scraperClient), {
    migrationsFolder: "./src/lib/drizzle/migrations-scraper",
  });
  scraperClient.close();
  console.log("[Drizzle] groweasy-scraper.db migrations applied successfully.");
}

main().catch((err) => {
  console.error("[Drizzle] Migration failed:", err);
  process.exit(1);
});
