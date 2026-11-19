/**
 * Provider selection for model drivers.
 *
 * OpenAI is driven through the Responses API; DeepSeek speaks the
 * OpenAI-compatible Chat Completions wire format. `LLM_PROVIDER` wins over
 * `MODEL_PROVIDER`. Resolved drivers are cached per provider.
 *
 * @module @/lib/llm/llm/runtime
 */

import { getOpenAIModel } from "@/lib/core/agent/client";
import { deepSeekChatDriver, getDeepSeekModel } from "@/lib/llm/llm-deepseek/chat";
import type { ModelDriver } from "./driver";
import { openAIResponsesDriver } from "@/lib/llm/llm-openai/responses";

/** Providers supported by this harness. */
export type ModelProvider = "openai" | "deepseek";

const SUPPORTED_PROVIDERS: readonly ModelProvider[] = [
  "openai",
  "deepseek",
];

const DRIVER_FACTORIES: Record<ModelProvider, () => ModelDriver> = {
  openai: () => openAIResponsesDriver,
  deepseek: () => deepSeekChatDriver,
};

const MODEL_RESOLVERS: Record<ModelProvider, () => string> = {
  openai: getOpenAIModel,
  deepseek: getDeepSeekModel,
};

const driverCache = new Map<ModelProvider, ModelDriver>();

/** Current provider value before normalization. */
function currentProviderSetting(): string {
  return process.env.LLM_PROVIDER ?? process.env.MODEL_PROVIDER ?? "openai";
}

/**
 * Normalize one provider name.
 *
 * @throws when the name is not a supported provider.
 */
function normalizeProvider(provider: string): ModelProvider {
  const normalized = provider.trim().toLowerCase();
  for (const supported of SUPPORTED_PROVIDERS) {
    if (normalized === supported) {
      return supported;
    }
  }
  throw new Error(
    `Unknown LLM provider "${normalized}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}.`,
  );
}

/** Resolve the active provider name. */
export function getProviderName(provider?: string): ModelProvider {
  return normalizeProvider(provider ?? currentProviderSetting());
}

/** Resolve the default model for the active provider. */
export function getDefaultModel(provider?: string): string {
  return MODEL_RESOLVERS[getProviderName(provider)]();
}

/**
 * Resolve the driver for a provider, caching one instance per provider.
 *
 * @param provider Provider name; defaults to the environment setting.
 * @throws when the provider is unknown.
 */
export function resolveModelDriver(
  provider: string = currentProviderSetting(),
): ModelDriver {
  const name = normalizeProvider(provider);
  const cached = driverCache.get(name);
  if (cached) {
    return cached;
  }
  const driver = DRIVER_FACTORIES[name]();
  driverCache.set(name, driver);
  return driver;
}
