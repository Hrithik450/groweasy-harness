import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/database";
import { sessions } from "../src/lib/db/schema/schema";
import { updateDetailBarItem, getDetailBarSnapshot, getDetailBarPage } from "../src/lib/detail.bar/service";
import { tabChildField } from "../src/lib/detail.bar/fields";

const db = getDb();
const s = db.select().from(sessions).where(eq(sessions.slug, "adManager")).get();
if (!s) throw new Error("no session");
const snap = getDetailBarSnapshot(s);
const group = snap.adManager ?? {};

// Roots no longer carry ads; children are one lazy page per campaign.
const adsField = tabChildField("campaigns")!;
let camp: any = null;
let ads: any[] = [];
for (const candidate of (group.campaigns as any[]) ?? []) {
  const kids = getDetailBarPage(s.id, adsField, {
    parentId: String(candidate.id),
  }).items as any[];
  if (kids.length > 0) {
    camp = candidate;
    ads = kids;
    break;
  }
}
if (!camp) throw new Error("no campaign with ads");
console.log("campaign:", camp.name, "metaStatus:", camp.metaStatus, "ads:", ads.length);
console.log("ad1:", ads[0]?.name, "status:", ads[0]?.action?.status);

const adId = String(ads[0]!.id);
const originalStatus = ads[0]?.status ?? "pending";
updateDetailBarItem(s, adId, { status: "ignored" }, adsField);
const after = (getDetailBarPage(s.id, adsField, { parentId: String(camp.id) }).items as any[]).find(
  (x) => x.id === adId,
);
console.log("after patch:", after?.action?.status);
updateDetailBarItem(s, adId, { status: originalStatus }, adsField);
console.log(
  "restored:",
  (getDetailBarPage(s.id, adsField, { parentId: String(camp.id) }).items as any[]).find(
    (x) => x.id === adId,
  )?.action?.status,
);

const page = getDetailBarPage(s.id, "campaigns", { limit: 2 }) as any;
console.log("roots:", page.items.map((i: any) => i.name), "nextCursor:", page.nextCursor);
