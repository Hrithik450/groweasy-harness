import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  getDeepSeekApiKey,
  getDeepSeekBaseURL,
  getDeepSeekModel,
  resolveDeepSeekOptions,
} from "../src/config";

test("resolveDeepSeekOptions defaults to the public endpoint and model", () => {
  const options = resolveDeepSeekOptions({}, {});
  assert.equal(options.apiKey, null);
  assert.equal(options.baseURL, DEFAULT_BASE_URL);
  assert.equal(options.model, DEFAULT_MODEL);
});

test("environment values fill unset options", () => {
  const options = resolveDeepSeekOptions(
    {},
    {
      DEEPSEEK_API_KEY: "  sk-test  ",
      DEEPSEEK_BASE_URL: "https://example.test/v1",
      DEEPSEEK_MODEL: " deepseek-reasoner ",
    },
  );

  assert.equal(options.apiKey, "sk-test");
  assert.equal(options.baseURL, "https://example.test/v1");
  assert.equal(options.model, "deepseek-reasoner");
});

test("config values win over environment values", () => {
  const options = resolveDeepSeekOptions(
    {
      apiKey: "sk-config",
      baseURL: "https://config.test/v1",
      model: "config-model",
    },
    {
      DEEPSEEK_API_KEY: "sk-env",
      DEEPSEEK_BASE_URL: "https://env.test/v1",
      DEEPSEEK_MODEL: "env-model",
    },
  );

  assert.equal(options.apiKey, "sk-config");
  assert.equal(options.baseURL, "https://config.test/v1");
  assert.equal(options.model, "config-model");
});

test("a blank API key or model recalculates the defaults", () => {
  const options = resolveDeepSeekOptions(
    {},
    { DEEPSEEK_API_KEY: "   ", DEEPSEEK_MODEL: "   " },
  );
  assert.equal(options.apiKey, null);
  assert.equal(options.model, DEFAULT_MODEL);
});

test("convenience resolvers read the same environment", () => {
  const environment = {
    DEEPSEEK_API_KEY: "sk-test",
    DEEPSEEK_BASE_URL: "https://example.test/v1",
    DEEPSEEK_MODEL: "deepseek-reasoner",
  };
  assert.equal(getDeepSeekApiKey(environment), "sk-test");
  assert.equal(getDeepSeekBaseURL(environment), "https://example.test/v1");
  assert.equal(getDeepSeekModel(environment), "deepseek-reasoner");
  assert.equal(getDeepSeekApiKey({}), null);
  assert.equal(getDeepSeekBaseURL({}), DEFAULT_BASE_URL);
  assert.equal(getDeepSeekModel({}), DEFAULT_MODEL);
});
