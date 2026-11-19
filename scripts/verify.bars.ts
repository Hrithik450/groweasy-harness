import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/database";
import { sessions } from "../src/lib/db/schema/schema";
import { patchBarItem, getDetailBarSnapshot, readBarPageFor } from "../src/lib/bar/service";

const db = getDb();
const s = db.select().from(sessions).where(eq(sessions.slug, "adManager")).get();
if (!s) throw new Error("no session");
const snap = getDetailBarSnapshot(s);
const group = snap.adManager ?? {};
const camp = group.campaigns?.find((c) => (c.ads?.length ?? 0) > 0);
if (!camp) throw new Error("no campaign with ads");
console.log("campaign:", camp?.name, "metaStatus:", camp?.metaStatus, "ads:", camp?.ads?.length);
console.log("ad1:", camp?.ads?.[0]?.name, "status:", camp?.ads?.[0]?.action?.status);
console.log("alerts:", group.alerts?.length, "status:", group.alerts?.[0]?.status, "note:", group.alerts?.[0]?.note);
const adId = camp.ads![0]!.id;
const originalStatus =
  (camp.ads![0] as unknown as { status?: string }).status ?? "pending";
patchBarItem(s, adId, { status: "ignored" });
const after = getDetailBarSnapshot(s);
const a = after.adManager?.campaigns
  ?.flatMap((c) => c.ads ?? [])
  .find((x) => x.id === adId);
console.log("after patch:", a?.action?.status);
patchBarItem(s, adId, { status: originalStatus });
console.log("restored:", getDetailBarSnapshot(s).adManager?.campaigns
  ?.flatMap((c) => c.ads ?? [])
  .find((x) => x.id === adId)?.action?.status);
const page = readBarPageFor(s.id, "campaigns", { limit: 2 });
console.log("page:", page.items.map((i) => i.name), "nextCursor:", page.nextCursor);
