/**
 * Table-constructor surface for the harness database.
 *
 * Only the live tables are exported here; the review-only message contract in
 * `session.message.schema.ts` is intentionally not wired into the schema so
 * drizzle-kit never sees two definitions of `session_messages`.
 *
 * @module @/lib/db/schema
 */

export * from "./schema";
export * from "./scraper";
