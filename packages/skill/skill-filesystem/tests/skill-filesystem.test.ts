import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import type { SkillProvider } from "@openai-harness/skill";

import { apply, name } from "../src/index";

test("apply registers one filesystem provider on ctx.skills", async () => {
  const root = mkdtempSync(join(tmpdir(), "skill-filesystem-"));
  const directory = join(root, "alpha-skill");
  mkdirSync(directory);
  writeFileSync(
    join(directory, "SKILL.md"),
    [
      "---",
      "name: alpha-skill",
      "description: Alpha instructions.",
      "---",
      "",
      "# Alpha",
    ].join("\n"),
  );

  const providers: SkillProvider[] = [];
  const ctx = {
    effect(callback: () => () => void) {
      callback();
    },
    skills: {
      registerProvider(provider: SkillProvider) {
        providers.push(provider);
        return () => {};
      },
    },
  } as unknown as Context;

  apply(ctx, { rootDir: root });
  assert.equal(name, "skill-filesystem");
  assert.equal(providers.length, 1);

  const provider = providers[0];
  assert.ok(provider !== undefined);
  const candidates = await provider.list({});
  assert.deepEqual(
    candidates.map((candidate) => candidate.name),
    ["alpha-skill"],
  );
  const definition = await provider.get("alpha-skill", {});
  assert.ok(definition?.content.includes("# Alpha"));
});
