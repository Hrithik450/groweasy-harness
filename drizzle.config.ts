import { defineConfig } from "drizzle-kit";

/** Main harness database: users, sessions, events, connectors, cron jobs. */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema/schema.ts",
  out: "./src/lib/drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/groweasy.db",
  },
});
