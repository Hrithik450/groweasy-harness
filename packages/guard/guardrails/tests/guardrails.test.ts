import test from "node:test";
import assert from "node:assert/strict";
import {
  ANSWER_CHECKS,
  TOOL_CHECKS,
  guardAnswerText,
  guardToolText,
  identity,
  identityCheck,
  runGuardrails,
  secretKeys,
  internalPaths,
} from "../src/index";

test("secret-keys redacts provider key material", () => {
  assert.equal(
    runGuardrails("Use sk-abcdefghijklmnop1234 to call it.", [secretKeys]).text,
    "Use [redacted key] to call it.",
  );
  assert.equal(
    runGuardrails("AWS AKIAABCDEFGHIJKLMNOP.", [secretKeys]).text,
    "AWS [redacted key].",
  );
  assert.equal(
    runGuardrails("Authorization: Bearer abcdefghijklmnopqrstuvwx", [
      secretKeys,
    ]).text,
    "Authorization: Bearer [redacted]",
  );
  assert.equal(
    runGuardrails("OPENAI_API_KEY=sk-abcdefghijklmnop1234", [secretKeys]).text,
    "[redacted env assignment]",
  );
  assert.equal(
    runGuardrails('api_key = "abcdefghijklmnopqrst"', [secretKeys]).text,
    "api_key = [redacted]",
  );
});

test("secret-keys redacts a PEM block", () => {
  const pem = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIEowIBAAKCAQEA",
    "-----END RSA PRIVATE KEY-----",
  ].join("\n");
  assert.equal(
    runGuardrails(`here it is\n${pem}\ndone`, [secretKeys]).text,
    "here it is\n[redacted private key]\ndone",
  );
});

test("secret-keys leaves ordinary copy alone", () => {
  const copy =
    "Call +91 98765 43210, use code SAVE20, budget $1,299, ref ABC123.";
  assert.equal(runGuardrails(copy, [secretKeys]).text, copy);
});

test("internal-paths redacts a checkout path but not a URL", () => {
  assert.equal(
    runGuardrails(
      "at /Users/hruthikm/Programming/openai-harness/apps/gateway/src/index.ts today",
      [internalPaths],
    ).text,
    "at [redacted path] today",
  );
  assert.equal(
    runGuardrails("/Users/alice/Programming/acme-app/src", [internalPaths])
      .text,
    "[redacted path]",
  );

  const url = "https://example.com/openai-harness/docs";
  assert.equal(runGuardrails(url, [internalPaths]).text, url);
});

test("identity redacts the reported leak verbatim", () => {
  assert.equal(
    guardAnswerText("I'm ChatGPT, an AI model from OpenAI."),
    "[identity withheld], [identity withheld].",
  );
  assert.equal(
    guardAnswerText("As an AI language model, I can't browse."),
    "[identity withheld], I can't browse.",
  );
  assert.equal(
    guardAnswerText("This answer is powered by OpenAI."),
    "This answer is [identity withheld].",
  );
});

test("identity ignores third-person and hyphenated compounds", () => {
  const untouched = [
    "ChatGPT is a competitor worth analysing.",
    "OpenAI Ads policies and Google Ads benchmarks.",
    "Meta Ads and Google Ads spend is up.",
    "Llama is an open-weight model.",
    "As an AI-powered platform, we ship faster campaigns.",
    "Google DeepMind released a new model this week.",
  ];
  for (const sentence of untouched) {
    assert.equal(runGuardrails(sentence, [identity]).text, sentence, sentence);
  }
});

test("identityCheck accepts a custom replacement", () => {
  const custom = identityCheck({ replacement: "[hidden]" });
  assert.equal(
    runGuardrails("I am an AI assistant.", [custom]).text,
    "[hidden].",
  );
});

test("the pipeline resolves overlapping findings once", () => {
  const text =
    "/Users/me/Programming/openai-harness/x OPENAI_API_KEY=sk-abcdefghijklmnop1234";
  const result = runGuardrails(text, [internalPaths, secretKeys]);
  assert.equal(result.text, "[redacted path] [redacted env assignment]");
  assert.equal(result.findings.length, 2);
  assert.deepEqual(
    result.findings.map((finding) => finding.check),
    ["internal-paths", "secret-keys"],
  );
});

test("answer checks are stricter than tool checks", () => {
  const text = "I'm ChatGPT.";
  assert.notEqual(guardAnswerText(text), text);
  assert.equal(guardToolText(text), text);
  assert.equal(TOOL_CHECKS.length, 1);
  assert.equal(ANSWER_CHECKS.length, 2);
});

test("default sets leave workspace paths alone", () => {
  const line =
    "Base directory for this skill: /Users/hruthikm/Programming/openai-harness/packages/skill/skill/skills/business-profile";
  assert.equal(guardToolText(line), line);
  assert.equal(guardAnswerText(line), line);
  assert.ok(!TOOL_CHECKS.includes(internalPaths));
  assert.ok(!ANSWER_CHECKS.includes(internalPaths));
});

test("empty input stays empty", () => {
  assert.deepEqual(runGuardrails(""), { text: "", findings: [] });
});
