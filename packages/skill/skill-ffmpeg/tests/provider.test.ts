import test from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";
import { BUNDLED_SKILL_RANK, SkillService } from "@openai-harness/skill";

import { apply, inject, name, provider } from "../src/index";

test("bundled ffmpeg provider lists and loads its skill", async () => {
  const [candidate] = await provider.list({});
  assert.ok(candidate);
  assert.equal(candidate.name, "ffmpeg");
  assert.equal(candidate.provider, provider.name);
  assert.equal(candidate.source, "bundled");
  assert.equal(candidate.rank, BUNDLED_SKILL_RANK);

  const definition = await provider.get("ffmpeg", {});
  assert.ok(definition);
  assert.equal(definition.name, "ffmpeg");
  assert.ok(definition.content.length > 0);
  assert.ok(definition.content.includes("ffmpeg") || definition.content.length > 100);
});

test("ffmpeg plugin registers its provider on ctx.skills", async () => {
  const ctx = new Context();
  await ctx.plugin(SkillService);
  await ctx.plugin({ name, inject, apply });
  assert.deepEqual(
    (await ctx.skills.list()).map((skill) => skill.name),
    ["ffmpeg"],
  );
  await ctx.fiber.dispose();
});
