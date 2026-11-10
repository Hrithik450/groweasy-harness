import test from "node:test";
import assert from "node:assert/strict";

import { LOG_PREVIEW_CHARS, preview } from "../src/debug";

test("a tool payload is previewed on one line, never dumped whole", () => {
  const skillBody = `# Skill\n\n${"instruction line\n".repeat(500)}`;
  const text = preview(skillBody);

  assert.ok(!text.includes("\n"), "the preview must stay on one line");
  assert.ok(text.length < LOG_PREVIEW_CHARS + 32, "the preview is clamped");
  assert.match(text, /\(\d+ chars\)$/);
});

test("small objects keep their shape on one line", () => {
  assert.equal(preview({ query: "Nike", targetCount: 1 }), '{"query":"Nike","targetCount":1}');
});

test("a cyclic payload never throws", () => {
  const value: Record<string, unknown> = {};
  value.self = value;
  assert.equal(typeof preview(value), "string");
});
