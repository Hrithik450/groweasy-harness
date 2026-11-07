import test from "node:test";
import assert from "node:assert/strict";

import {
  isModelInvocable,
  isSkillName,
  isUserInvocable,
  normalizeSkillName,
  parseFrontmatter,
  parseInvocationPolicy,
  renderSkillContent,
  SkillRegistry,
  toSkillSummary,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from "../src/index";

function candidate(
  name: string,
  rank: number,
  provider: string,
  overrides: Partial<SkillCandidate> = {},
): SkillCandidate {
  return {
    name,
    description: `${name} description`,
    invocation: { modelInvocable: true, userInvocable: true },
    source: "custom",
    provider,
    rank,
    ...overrides,
  };
}

function definitionFor(
  entry: SkillCandidate,
  content = `Body for ${entry.name}.`,
): SkillDefinition {
  return { ...toSkillSummary(entry), content };
}

function staticProvider(
  name: string,
  candidates: SkillCandidate[],
): SkillProvider {
  const definitions = new Map(
    candidates.map((entry) => [entry.name, definitionFor(entry)]),
  );
  return {
    name,
    list: async () => candidates,
    get: async (skillName) => definitions.get(skillName),
  };
}

test("isSkillName and normalizeSkillName enforce the public grammar", () => {
  assert.equal(isSkillName("competitor-research"), true);
  assert.equal(isSkillName("ffmpeg"), true);
  assert.equal(isSkillName("Invalid_Skill"), false);
  assert.equal(isSkillName("skill/subpath"), false);
  assert.equal(isSkillName("-leading-hyphen"), false);
  assert.equal(normalizeSkillName(" Business_Profile "), "business-profile");
});

test("parseInvocationPolicy rejects legacy camelCase keys", () => {
  const defaults = parseInvocationPolicy({});
  assert.deepEqual(defaults, { modelInvocable: true, userInvocable: true });

  assert.deepEqual(
    parseInvocationPolicy({ "disable-model-invocation": true }),
    { modelInvocable: false, userInvocable: true },
  );
  assert.deepEqual(parseInvocationPolicy({ "user-invocable": false }), {
    modelInvocable: true,
    userInvocable: false,
  });

  assert.throws(
    () => parseInvocationPolicy({ disableModelInvocation: true }),
    /disable-model-invocation/,
  );
  assert.throws(
    () => parseInvocationPolicy({ userInvocable: true }),
    /user-invocable/,
  );
});

test("parseFrontmatter splits YAML metadata from the body", () => {
  const parsed = parseFrontmatter(
    ["---", "name: sample-skill", "description: Sample.", "---", "", "# Body"].join(
      "\n",
    ),
  );
  assert.equal(parsed.data.name, "sample-skill");
  assert.equal(parsed.data.description, "Sample.");
  assert.ok(parsed.content.includes("# Body"));
  assert.equal(parsed.content.includes("name:"), false);
});

test("renderSkillContent wraps instructions and resources in canonical tags", () => {
  const rendered = renderSkillContent({
    name: "test-skill",
    provider: "bundled",
    resourceBase: { kind: "directory", path: "/workspace/skills/test-skill" },
    content: "Do something specific.",
  });

  assert.ok(rendered.includes('<skill_content name="test-skill">'));
  assert.ok(
    rendered.includes(
      "Base directory for this skill: /workspace/skills/test-skill",
    ),
  );
  assert.ok(rendered.includes("<skill_instructions>"));
  assert.ok(rendered.includes("Do something specific."));
  assert.ok(rendered.includes("</skill_content>"));
});

test("registerProvider lists candidates and its disposer unregisters", async () => {
  const registry = new SkillRegistry();
  const dispose = registry.registerProvider(
    staticProvider("custom", [candidate("alpha-skill", 100, "custom")]),
  );

  assert.deepEqual(
    (await registry.list()).map((skill) => skill.name),
    ["alpha-skill"],
  );

  dispose();
  assert.deepEqual(await registry.list(), []);
});

test("ranked resolution prefers lower rank, then registration order", async () => {
  const registry = new SkillRegistry();
  registry.registerProvider(
    staticProvider("later", [candidate("alpha-skill", 200, "later")]),
  );
  registry.registerProvider(
    staticProvider("earlier", [candidate("alpha-skill", 100, "earlier")]),
  );

  const resolved = await registry.get("alpha-skill");
  assert.equal(resolved?.provider, "earlier");
});

test("scoped layers overlay global registrations and win duplicate names", async () => {
  const registry = new SkillRegistry();
  registry.registerProvider(
    staticProvider("global", [candidate("alpha-skill", 100, "global")]),
  );
  registry.registerProvider(
    staticProvider("scoped", [candidate("alpha-skill", 900, "scoped")]),
    { scope: "agent-a" },
  );

  assert.equal((await registry.get("alpha-skill"))?.provider, "global");
  assert.equal(
    (await registry.get("alpha-skill", { scope: "agent-a" }))?.provider,
    "scoped",
  );
});

test("runtime contributions resolve through the same ranked layers", async () => {
  const registry = new SkillRegistry();
  registry.register({
    name: "runtime-skill",
    description: "A runtime skill.",
    content: "Runtime body.",
  });

  const skill = await registry.get("runtime-skill");
  assert.equal(skill?.provider, "runtime");
  assert.equal(skill?.content, "Runtime body.");

  const summary = (await registry.list()).find(
    (entry) => entry.name === "runtime-skill",
  );
  assert.ok(summary);
  assert.equal(isModelInvocable(summary), true);
  assert.equal(isUserInvocable(summary), true);
});

test("snapshot reports incomplete discovery when a provider rejects", async () => {
  const registry = new SkillRegistry();
  registry.registerProvider({
    name: "broken",
    list: async () => {
      throw new Error("boom");
    },
    get: async () => undefined,
  });
  registry.registerProvider(
    staticProvider("custom", [candidate("alpha-skill", 100, "custom")]),
  );

  const snapshot = await registry.snapshot();
  assert.equal(snapshot.complete, false);
  assert.deepEqual(
    snapshot.skills.map((skill) => skill.name),
    ["alpha-skill"],
  );
});
