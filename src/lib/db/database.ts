/**
 * SQLite connection management for the harness and scraper databases.
 *
 * Connections are memoised on `globalThis` so Next.js hot-reloads reuse one
 * handle instead of leaking a pool per module instance. Both databases run in
 * WAL mode with foreign-key enforcement enabled.
 *
 * @module @/lib/db/database
 */

import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/schema";
import * as scraperSchema from "./schema/scraper";
import path from "node:path";
import fs from "node:fs";

// Default to ./data so the app is self-contained; migration.ts and deployments
// may point the same database elsewhere through the environment.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH =
  process.env.DATABASE_PATH || path.join(DATA_DIR, "groweasy.db");
const SCRAPER_DB_PATH =
  process.env.SCRAPER_DATABASE_PATH || path.join(DATA_DIR, "groweasy-scraper.db");

// Global cache to prevent multiple connection pools during Next.js hot-reloads
const globalForDb = globalThis as unknown as {
  drizzleDb: BetterSQLite3Database<typeof schema> | undefined;
  scraperDb: BetterSQLite3Database<typeof scraperSchema> | undefined;
};

function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!globalForDb.drizzleDb) {
    ensureDataDir();
    ensureDirFor(DB_PATH);
    const client = new Database(DB_PATH);

    // WAL mode for fast concurrent reads and writes without blocking
    client.pragma("journal_mode = WAL");
    client.pragma("busy_timeout = 5000");
    client.pragma("synchronous = NORMAL");
    client.pragma("foreign_keys = ON");

    globalForDb.drizzleDb = drizzle(client, { schema });
  }
  return globalForDb.drizzleDb;
}

export function getScraperDb(): BetterSQLite3Database<typeof scraperSchema> {
  if (!globalForDb.scraperDb) {
    ensureDataDir();
    ensureDirFor(SCRAPER_DB_PATH);
    const client = new Database(SCRAPER_DB_PATH);

    // Fast WAL configuration & concurrency pragma
    client.pragma("journal_mode = WAL");
    client.pragma("busy_timeout = 5000");
    client.pragma("synchronous = NORMAL");
    client.pragma("foreign_keys = ON");

    globalForDb.scraperDb = drizzle(client, { schema: scraperSchema });
  }
  return globalForDb.scraperDb;
}

export const db = getDb();
export const scraperDb = getScraperDb();
export { schema, scraperSchema };
