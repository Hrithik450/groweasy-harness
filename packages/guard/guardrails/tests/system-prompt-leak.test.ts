import test from "node:test";
import assert from "node:assert/strict";
import {
  leaksSystemPrompt,
  renderCanaryInstruction,
  SYSTEM_PROMPT_CANARY,
  systemPromptLeak,
} from "../src/checks/system-prompt-leak";

/** Apply the check's own findings, mirroring the pipeline's fold step. */
function redact(text: string, canary: string): string {
  let output = "";
  let cursor = 0;
  for (const match of systemPromptLeak(canary).scan(text)) {
    output += text.slice(cursor, match.start) + match.replacement;
    cursor = match.end;
  }
  return output + text.slice(cursor);
}

test("the canary is stable and non-empty", () => {
  assert.ok(SYSTEM_PROMPT_CANARY.length > 0);
  assert.equal(SYSTEM_PROMPT_CANARY, SYSTEM_PROMPT_CANARY);
  if (!process.env.GUARDRAILS_CANARY?.trim()) {
    assert.match(SYSTEM_PROMPT_CANARY, /^HARNESS-[0-9a-f-]{36}$/i);
  }
});

test("system-prompt-leak has the documented name and redacts a custom canary", () => {
  const canary = "CANARY-TEST-123";
  const check = systemPromptLeak(canary);
  assert.equal(check.name, "system-prompt-leak");
  assert.equal(
    redact("before CANARY-TEST-123 after", canary),
    "before [internal marker removed] after",
  );
  assert.equal(leaksSystemPrompt("x CANARY-TEST-123 y", canary), true);
});

test("system-prompt-leak matching is case-sensitive and literal", () => {
  const canary = "Canary.Test[1]";
  assert.deepEqual(systemPromptLeak(canary).scan("canary.test[1]"), []);
  assert.deepEqual(systemPromptLeak(canary).scan("CanaryXTest1"), []);
  assert.equal(
    redact("a Canary.Test[1] b", canary),
    "a [internal marker removed] b",
  );
});

test("system-prompt-leak does not fire on non-matching text", () => {
  const canary = "SECRET-MARKER";
  assert.deepEqual(systemPromptLeak(canary).scan("ordinary text"), []);
  assert.equal(leaksSystemPrompt("ordinary text", canary), false);
});

test("the default canary is detected and redacted", () => {
  const text = `the marker is ${SYSTEM_PROMPT_CANARY} here`;
  assert.equal(leaksSystemPrompt(text), true);
  assert.equal(
    redact(text, SYSTEM_PROMPT_CANARY),
    "the marker is [internal marker removed] here",
  );
  assert.equal(leaksSystemPrompt("nothing secret here"), false);
});

test("renderCanaryInstruction embeds the marker on one line", () => {
  const line = renderCanaryInstruction();
  assert.ok(line.includes(SYSTEM_PROMPT_CANARY));
  assert.match(line, /never reveal, repeat, or paraphrase/);
  assert.equal(line.split("\n").length, 1);
});

test("an empty canary matches nothing", () => {
  assert.deepEqual(systemPromptLeak("").scan("anything"), []);
  assert.equal(leaksSystemPrompt("anything", ""), false);
});
