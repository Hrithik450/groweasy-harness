import test from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";

import { SkillService } from "../src/index";

test("SkillService mounts ctx.skills and delegates to its registry", async () => {
  const ctx = new Context();
  await ctx.plugin(SkillService);
  assert.ok(ctx.skills instanceof SkillService);

  const dispose = ctx.skills.register({
    name: "service-skill",
    description: "Mounted through Cordis.",
    content: "Service body.",
  });
  assert.deepEqual(
    (await ctx.skills.list()).map((skill) => skill.name),
    ["service-skill"],
  );
  assert.equal(
    (await ctx.skills.get("service-skill"))?.content,
    "Service body.",
  );

  dispose();
  assert.deepEqual(await ctx.skills.list(), []);
  await ctx.fiber.dispose();
});
