/**
 * Seed one preview turn with a broad UI-block sample.
 *
 * Run: npx tsx scripts/preview.ui.blocks.ts [sessionId]
 * Then reload the printed chat URL once.
 *
 * This writes only to the local database. It refuses to run against the
 * production server database.
 */

import fs from "node:fs";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/database";
import { sessions } from "../src/lib/db/schema/schema";
import { sessionEventsRepo } from "../src/lib/session/persistence/events.repo";
import { uuidv7 } from "../src/lib/utils/uuid";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const dbPath = process.env.DATABASE_PATH ?? "";
if (dbPath.includes("servers/harness")) {
  throw new Error("Refusing to write a preview turn into the production DB.");
}

const db = getDb();
const sessionId =
  process.argv[2] ||
  db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.slug, "adStrategist"))
    .orderBy(desc(sessions.updatedAt))
    .get()?.id;

if (!sessionId) throw new Error("No adStrategist session found.");
const targetSessionId: string = sessionId;

const spec = {
  root: "root",
  elements: {
    root: {
      type: "Stack",
      props: {
        direction: "vertical",
        gap: "md",
        align: "stretch",
        justify: "start",
      },
      children: [],
    },
  },
};

async function main(): Promise<void> {
  const existing = await sessionEventsRepo.getEvents(targetSessionId);
  const turn =
    existing.reduce((max, event) => {
      if (event.type !== "turn/start") return max;
      return Math.max(max, event.data.turn);
    }, 0) + 1;
  const seq = await sessionEventsRepo.getNextSeq(targetSessionId);

  const messageId = uuidv7();
  await sessionEventsRepo.appendBatch(targetSessionId, [
    {
      type: "turn/start",
      seq: seq as never,
      time: Date.now(),
      data: { turn },
    },
    {
      type: "user/message",
      seq: (seq + 1) as never,
      time: Date.now(),
      data: {
        id: messageId,
        role: "user",
        content: [{ type: "text", text: "Show me the UI block preview" }],
        source: { kind: "user", rpcId: messageId },
      } as never,
    },
    {
      type: "ui/block",
      seq: (seq + 2) as never,
      time: Date.now(),
      data: { id: uuidv7(), spec: spec as never },
    },
    {
      type: "turn/end",
      seq: (seq + 3) as never,
      time: Date.now(),
      data: { turn, reason: { kind: "completed" } },
    },
  ]);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  console.log(`Preview block seeded in session ${targetSessionId}`);
  console.log(`Open: ${appUrl.replace(/\/$/, "")}/c/${targetSessionId}`);
  console.log("Reload the page once if it is already open.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
