import test from "node:test";
import assert from "node:assert/strict";

import { BUNDLED_SKILL_RANK } from "@openai-harness/skill";

import { provider } from "../src/index";

test("bundled campaign-builder provider lists and loads its skill", async () => {
  const [candidate] = await provider.list({});
  assert.ok(candidate);
  assert.equal(candidate.name, "campaign-builder");
  assert.equal(candidate.provider, provider.name);
  assert.equal(candidate.source, "bundled");
  assert.equal(candidate.rank, BUNDLED_SKILL_RANK);

  const definition = await provider.get("campaign-builder", {});
  assert.ok(definition);
  assert.equal(definition.name, "campaign-builder");
  assert.ok(definition.content.length > 0);
  assert.ok(definition.content.includes("campaign-builder") || definition.content.length > 100);
});
