import test from "node:test";
import assert from "node:assert/strict";

import { BUNDLED_SKILL_RANK } from "@openai-harness/skill";

import { provider } from "../src/index";

test("bundled reports provider lists and loads its skill", async () => {
  const [candidate] = await provider.list({});
  assert.ok(candidate);
  assert.equal(candidate.name, "reports");
  assert.equal(candidate.provider, provider.name);
  assert.equal(candidate.source, "bundled");
  assert.equal(candidate.rank, BUNDLED_SKILL_RANK);

  const definition = await provider.get("reports", {});
  assert.ok(definition);
  assert.equal(definition.name, "reports");
  assert.ok(definition.content.length > 0);
  assert.ok(definition.content.includes("saveReport"));
  assert.ok(definition.content.includes("fetchMetaAdAccounts"));
  assert.ok(definition.content.includes("queryMetaGraphAPI"));
  assert.ok(!definition.content.includes("updateAlerts"));
  assert.ok(!definition.content.includes("updateSuggestions"));
});
