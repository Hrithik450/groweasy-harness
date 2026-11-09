import test from "node:test";
import assert from "node:assert/strict";

import {
  agentPresets,
  getAgentPreset,
  resolveAgentPreset,
  resolvePresetTools,
  type ToolLookup,
} from "../src/index";

/** Every name declared by any preset, used to build an admitting stub. */
const DECLARED_TOOL_NAMES = new Set(
  Object.values(agentPresets).flatMap((preset) => preset.tools),
);

/** A stub registry that resolves every declared name to its own definition. */
const admittingRegistry: ToolLookup<{ name: string }> = {
  get: (name) => (DECLARED_TOOL_NAMES.has(name) ? { name } : undefined),
};

test("every preset is named after its key and composes tools", () => {
  for (const [key, preset] of Object.entries(agentPresets)) {
    assert.equal(preset.name, key);
    assert.ok(preset.tools.length > 0, `preset "${key}" composes no tools`);
  }
});

test("every preset lists unique tool names", () => {
  for (const [key, preset] of Object.entries(agentPresets)) {
    assert.equal(
      new Set(preset.tools).size,
      preset.tools.length,
      `preset "${key}" lists a duplicate tool name`,
    );
  }
});

test("preset lookup falls back to default", () => {
  assert.equal(agentPresets.default.name, "default");
  assert.equal(getAgentPreset(undefined), undefined);
  assert.equal(getAgentPreset(null), undefined);
  assert.equal(getAgentPreset("not-a-slug"), undefined);
  assert.equal(resolveAgentPreset(undefined).name, "default");
  assert.equal(resolveAgentPreset(null).name, "default");
  assert.equal(resolveAgentPreset("not-a-slug").name, "default");
  assert.equal(resolveAgentPreset("adCreator").name, "adCreator");
});

test("default preset covers every preset's tool surface", () => {
  const fallback = new Set(agentPresets.default.tools);
  for (const [key, preset] of Object.entries(agentPresets)) {
    if (key === "default") continue;
    for (const name of preset.tools) {
      assert.ok(fallback.has(name), `default omits "${name}" from preset "${key}"`);
    }
  }
});

test("resolvePresetTools expands a preset in preset order", () => {
  for (const slug of Object.keys(agentPresets)) {
    const preset = resolveAgentPreset(slug);
    const tools = resolvePresetTools(slug, admittingRegistry);
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [...preset.tools],
      `resolved tools for "${slug}" differ from its preset`,
    );
  }
});

test("any role that reads the ad library can also inspect the media it returns", () => {
  // The customer asks "what is this video?", never "call readVideos": a role
  // handed video/image ads without the readers answers "I cannot see video".
  for (const [key, preset] of Object.entries(agentPresets)) {
    if (key === "default") continue;
    if (!preset.tools.includes("searchAdLibrary")) continue;
    const tools = new Set(preset.tools);
    for (const reader of ["readVideos", "readImages"]) {
      assert.ok(
        tools.has(reader),
        `preset "${key}" searches the ad library but cannot ${reader}`,
      );
    }
  }
});

test("resolvePresetTools emits one definition per tool name", () => {
  const tools = resolvePresetTools("adCreator", admittingRegistry);
  assert.equal(
    new Set(tools.map((tool) => tool.name)).size,
    tools.length,
    "a duplicate tool name would be rejected by the provider",
  );
});

test("the three marketing surfaces each compose the whole catalog", () => {
  // adManager, adCreator, and adStrategist are surfaces of one backend agent,
  // so none of them may lack a tool another one has.
  for (const slug of ["adManager", "adCreator", "adStrategist"] as const) {
    const tools = resolveAgentPreset(slug).tools;
    assert.deepEqual(
      [...tools],
      [...agentPresets.default.tools],
      `"${slug}" must compose every registered tool`,
    );
  }

  assert.deepEqual([...agentPresets.businessProfile.tools], [
    "searchWeb",
    "scrapeWebPage",
    "alternateWebSearch",
    "skill",
    "searchAdLibrary",
    "readImages",
    "readVideos",
    "fetchImageTypes",
    "fetchBusinessProfile",
    "saveBusinessProfile",
    "fetchShopifyProducts",
    "fetchShopifyCollections",
  ]);

  // Unknown slugs keep the fallback's full surface.
  assert.equal(
    resolvePresetTools(null, admittingRegistry).length,
    agentPresets.default.tools.length,
  );
});

test("unknown tool names are ignored loudly", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const resolved = resolvePresetTools("adManager", { get: () => undefined });
    assert.deepEqual(resolved, []);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /references unregistered tool\(s\)/);
});
