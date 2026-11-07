import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BUNDLED_SKILL_RANK,
  BundledFileSystemSkillProvider,
  SkillRegistry,
} from "../src/index";

function writeSkill(root: string, relativeDir: string, frontmatter: string, body: string): void {
  const directory = join(root, relativeDir);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "SKILL.md"),
    ["---", frontmatter, "---", "", body].join("\n"),
  );
}

test("bundled filesystem provider discovers, ranks, and loads SKILL.md files", async () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-skills-"));
  writeSkill(
    root,
    "account/alpha-skill",
    ["name: alpha-skill", "description: Alpha instructions.", "whenToUse: When alpha."].join("\n"),
    "# Alpha\n\nGuardrails apply.",
  );
  writeSkill(
    root,
    "nested/beta-skill",
    ["name: beta-skill", "description: Beta instructions."].join("\n"),
    "# Beta",
  );
  // Invalid names are skipped, not fatal.
  writeSkill(
    root,
    "invalid/invalid-skill",
    ["name: invalid skill name", "description: Invalid."].join("\n"),
    "# Invalid",
  );

  const provider = new BundledFileSystemSkillProvider(root);
  const candidates = await provider.list();
  assert.deepEqual(
    candidates.map((candidate) => candidate.name).sort(),
    ["alpha-skill", "beta-skill"],
  );

  const alpha = candidates.find((candidate) => candidate.name === "alpha-skill");
  assert.equal(alpha?.provider, "bundled");
  assert.equal(alpha?.source, "bundled");
  assert.equal(alpha?.rank, BUNDLED_SKILL_RANK);
  assert.equal(alpha?.whenToUse, "When alpha.");
  assert.deepEqual(alpha?.resourceBase, {
    kind: "directory",
    path: join(root, "account/alpha-skill"),
  });
  assert.ok(alpha?.path?.endsWith("SKILL.md"));

  const definition = await provider.get("alpha-skill", {});
  assert.equal(definition?.name, "alpha-skill");
  assert.ok(definition?.content.includes("# Alpha"));
  assert.equal(definition?.content.includes("name: alpha-skill"), false);
  assert.equal(await provider.get("missing-skill", {}), undefined);
});

test("bundled filesystem provider composes through the ranked registry", async () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-registry-"));
  writeSkill(
    root,
    "alpha-skill",
    "name: alpha-skill\ndescription: Alpha instructions.",
    "# Alpha",
  );

  const registry = new SkillRegistry();
  registry.registerProvider(new BundledFileSystemSkillProvider(root));
  const skills = await registry.list();
  assert.deepEqual(skills.map((skill) => skill.name), ["alpha-skill"]);
  assert.ok((await registry.get("alpha-skill"))?.content.includes("# Alpha"));
});
