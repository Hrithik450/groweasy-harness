import test from "node:test";
import assert from "node:assert/strict";

import { BUNDLED_SKILL_RANK } from "@openai-harness/skill";

import { provider } from "../src/index";

test("bundled static-ad provider lists and loads its skill", async () => {
  const [candidate] = await provider.list({});
  assert.ok(candidate);
  assert.equal(candidate.name, "static-ad");
  assert.equal(candidate.provider, provider.name);
  assert.equal(candidate.source, "bundled");
  assert.equal(candidate.rank, BUNDLED_SKILL_RANK);

  const definition = await provider.get("static-ad", {});
  assert.ok(definition);
  assert.equal(definition.name, "static-ad");
  assert.ok(definition.content.length > 0);
  assert.ok(definition.content.includes("static-ad") || definition.content.length > 100);
});
