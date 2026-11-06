import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_MODEL,
  resolveOpenAIApi,
  resolveOpenAIReasoningEffort,
  resolveOpenAIOptions,
} from "../src/options";

test("resolveOpenAIOptions defaults to the Responses endpoint and built-in model", () => {
  const options = resolveOpenAIOptions({}, {});
  assert.equal(options.api, "responses");
  assert.equal(options.apiKey, null);
  assert.equal(options.baseURL, undefined);
  assert.equal(options.model, DEFAULT_MODEL);
  assert.equal(options.reasoningEffort, "medium");
});

test("environment values fill unset options", () => {
  const options = resolveOpenAIOptions(
    {},
    {
      OPENAI_API_KEY: "  sk-test  ",
      OPENAI_BASE_URL: "https://example.test/v1",
      OPENAI_MODEL: "gpt-5",
      OPENAI_API: "chat",
      OPENAI_REASONING_EFFORT: "high",
    },
  );

  assert.equal(options.apiKey, "sk-test");
  assert.equal(options.baseURL, "https://example.test/v1");
  assert.equal(options.model, "gpt-5");
  assert.equal(options.api, "chat");
  assert.equal(options.reasoningEffort, "high");
});

test("OPENAI_AGENT_MODEL is used when OPENAI_MODEL is unset", () => {
  assert.equal(
    resolveOpenAIOptions({}, { OPENAI_AGENT_MODEL: "agent-model" }).model,
    "agent-model",
  );
});

test("config values win over environment values", () => {
  const options = resolveOpenAIOptions(
    {
      apiKey: "sk-config",
      model: "config-model",
      api: "responses",
      reasoningEffort: "low",
    },
    {
      OPENAI_API_KEY: "sk-env",
      OPENAI_MODEL: "env-model",
      OPENAI_API: "chat",
      OPENAI_REASONING_EFFORT: "xhigh",
    },
  );

  assert.equal(options.apiKey, "sk-config");
  assert.equal(options.model, "config-model");
  assert.equal(options.api, "responses");
  assert.equal(options.reasoningEffort, "low");
});

test("an unsupported reasoning effort falls back to the default", () => {
  assert.equal(
    resolveOpenAIReasoningEffort({ OPENAI_REASONING_EFFORT: "max" }),
    "medium",
  );
});

test("only OPENAI_API=chat selects Chat Completions", () => {
  assert.equal(resolveOpenAIApi({ OPENAI_API: "chat" }), "chat");
  assert.equal(resolveOpenAIApi({ OPENAI_API: "responses" }), "responses");
  assert.equal(resolveOpenAIApi({}), "responses");
});
