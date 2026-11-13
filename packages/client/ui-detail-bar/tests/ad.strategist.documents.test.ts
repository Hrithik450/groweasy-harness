import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignBriefDocuments,
  isCampaignBriefDocument,
} from "../src/client/sessions/ad-strategist/documents";
import type { AdStrategistDocument } from "../src/types";

function document(
  id: string,
  kind: string,
  icon?: AdStrategistDocument["icon"],
): AdStrategistDocument {
  return { id, title: id, kind, dateLabel: "today", icon };
}

test("documents tagged with the brief icon are campaign briefs", () => {
  assert.equal(
    isCampaignBriefDocument(document("d1", "Something else", "brief")),
    true,
  );
});

test("kinds naming a brief are campaign briefs, case-insensitively", () => {
  assert.equal(isCampaignBriefDocument(document("d1", "Campaign brief")), true);
  assert.equal(isCampaignBriefDocument(document("d2", "CREATIVE BRIEF")), true);
});

test("competitor, strategy, and audience documents are research", () => {
  assert.equal(
    isCampaignBriefDocument(document("d1", "Competitor report", "competitor")),
    false,
  );
  assert.equal(
    isCampaignBriefDocument(document("d2", "Marketing strategy", "strategy")),
    false,
  );
  assert.equal(
    isCampaignBriefDocument(document("d3", "Audience report", "audience")),
    false,
  );
});

test("unknown kinds default to research", () => {
  assert.equal(isCampaignBriefDocument(document("d1", "Untitled")), false);
  assert.equal(isCampaignBriefDocument(document("d2", "")), false);
});

test("campaignBriefDocuments keeps only the brief documents", () => {
  const documents = [
    document("brief-1", "Campaign brief", "brief"),
    document("research-1", "Competitor report", "competitor"),
    document("brief-2", "Creative brief"),
    document("research-2", "Audience report", "audience"),
  ];

  assert.deepEqual(
    campaignBriefDocuments(documents).map((item) => item.id),
    ["brief-1", "brief-2"],
  );
});
