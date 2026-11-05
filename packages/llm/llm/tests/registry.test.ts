import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelDriver, ModelFrame } from "../src/driver";
import { ModelDriverRegistry } from "../src/runtime";

const ENV_KEYS = ["LLM_PROVIDER", "MODEL_PROVIDER"] as const;

function driver(label: string): ModelDriver {
  return {
    async *stream(): AsyncGenerator<ModelFrame> {
      yield { type: "done", finishReason: label };
    },
  };
}

/** Run `fn` with only the listed environment variables overridden. */
function withEnv<T>(
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  fn: () => T,
): T {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function registry(): ModelDriverRegistry {
  const registry = new ModelDriverRegistry();
  registry.register("openai", {
    driver: () => driver("openai"),
    defaultModel: () => "openai-model",
  });
  registry.register("deepseek", {
    driver: driver("deepseek"),
    defaultModel: () => "deepseek-model",
  });
  return registry;
}

test("defaults to openai when no provider is configured", () => {
  withEnv({}, () => {
    const providers = registry();
    assert.equal(providers.getProviderName(), "openai");
    assert.equal(providers.getDefaultModel(), "openai-model");
    assert.equal(providers.resolve(), providers.resolve());
  });
});

test("LLM_PROVIDER selects a provider and wins over MODEL_PROVIDER", () => {
  withEnv({ LLM_PROVIDER: "deepseek" }, () => {
    assert.equal(registry().getProviderName(), "deepseek");
  });
  withEnv({ LLM_PROVIDER: "openai", MODEL_PROVIDER: "deepseek" }, () => {
    assert.equal(registry().getProviderName(), "openai");
  });
});

test("MODEL_PROVIDER applies when LLM_PROVIDER is unset", () => {
  withEnv({ MODEL_PROVIDER: "deepseek" }, () => {
    assert.equal(registry().getDefaultModel(), "deepseek-model");
  });
});

test("provider names are normalized and an explicit provider wins", () => {
  withEnv({ LLM_PROVIDER: "deepseek" }, () => {
    const providers = registry();
    assert.equal(providers.getProviderName("  OpenAI  "), "openai");
  });
});

test("unknown providers throw with the registered set", () => {
  assert.throws(
    () => registry().getProviderName("anthropic"),
    /Unknown LLM provider "anthropic"\. Supported providers: openai, deepseek\./,
  );
});

test("drivers are cached per provider and variant", () => {
  let variant = "a";
  const providers = new ModelDriverRegistry();
  const constructed: string[] = [];
  providers.register("openai", {
    driver: () => {
      constructed.push(variant);
      return driver(variant);
    },
    defaultModel: () => "model",
    variantKey: () => variant,
  });

  const first = providers.resolve("openai");
  assert.equal(providers.resolve("openai"), first);
  variant = "b";
  const second = providers.resolve("openai");
  assert.notEqual(second, first);
  assert.equal(providers.resolve("openai"), second);
  assert.deepEqual(constructed, ["a", "b"]);
});

test("unregistering a provider clears its cached drivers", () => {
  const providers = new ModelDriverRegistry();
  const unregister = providers.register("openai", {
    driver: () => driver("openai"),
    defaultModel: () => "model",
  });

  const first = providers.resolve("openai");
  unregister();
  assert.deepEqual(providers.listProviders(), []);
  assert.throws(() => providers.resolve("openai"), /Unknown LLM provider/);

  providers.register("openai", {
    driver: () => driver("replacement"),
    defaultModel: () => "model",
  });
  assert.notEqual(providers.resolve("openai"), first);
});
