/**
 * Model-driver composition for this deployment.
 *
 * The registry, provider normalization, and per-variant driver cache live in
 * `@openai-harness/llm`. This module is the host's composition of it: it
 * registers the providers this deployment ships and exports the resolution
 * helpers the agent loop and workflows consume.
 *
 * The active provider comes from `LLM_PROVIDER`, then `MODEL_PROVIDER`, and
 * defaults to OpenAI. OpenAI uses the Responses API so reasoning-capable models
 * can call function tools; set `OPENAI_API=chat` to force Chat Completions for
 * models that only support that endpoint. DeepSeek always uses Chat
 * Completions.
 *
 * @module @openai-harness/gateway/wiring/llm
 */

import { attachmentStoreFor } from "@openai-harness/attachment-r2";
import {
  ModelDriverRegistry,
  currentProviderSetting,
  type ModelDriver,
} from "@openai-harness/llm";
import {
  REQUEST_IMAGE_TARGET,
  createOpenAIChatDriver,
  createOpenAIResponsesDriver,
  getOpenAIModel,
  resolveOpenAIApi,
  type LoadRequestImage,
  type OpenAIApi,
} from "@openai-harness/llm-openai";
import { deepSeekChatDriver, getDeepSeekModel } from "@openai-harness/llm-deepseek";

/**
 * Read one request image from the owning tenant's attachment store.
 *
 * The provider package has no storage dependency; this is the deployment's
 * loader, injected into both OpenAI drivers below.
 *
 * @param ref - durable image reference.
 * @param tenantId - owning tenant; absent means unresolved.
 * @returns the provider-ready image, or `null` when no tenant was supplied.
 */
export const loadRequestImage: LoadRequestImage = (ref, tenantId) => {
  if (tenantId === undefined) return Promise.resolve(null);
  return attachmentStoreFor(tenantId).readImageRequest(
    ref,
    REQUEST_IMAGE_TARGET,
  );
};

/** Providers supported by this harness. */
export type ModelProvider = "openai" | "deepseek";

export type { OpenAIApi };

/** Read the OpenAI endpoint selection, defaulting to the Responses API. */
export function getOpenAIApi(): OpenAIApi {
  return resolveOpenAIApi(process.env);
}

/** Chat Completions driver bound to the tenant attachment store. */
export const openAIChatDriver = createOpenAIChatDriver({
  loadImage: loadRequestImage,
});

/** Responses driver bound to the tenant attachment store. */
export const openAIResponsesDriver = createOpenAIResponsesDriver({
  loadImage: loadRequestImage,
});

/**
 * One registry per process.
 *
 * The package also exports a process-wide registry; this composition keeps its
 * own instance so a development reload cannot re-register a provider route.
 */
const modelDrivers = new ModelDriverRegistry();

modelDrivers.register("openai", {
  driver: () =>
    getOpenAIApi() === "chat" ? openAIChatDriver : openAIResponsesDriver,
  defaultModel: getOpenAIModel,
  variantKey: getOpenAIApi,
});

modelDrivers.register("deepseek", {
  driver: deepSeekChatDriver,
  defaultModel: getDeepSeekModel,
});

/** Resolve the active provider name. */
export function getProviderName(provider?: string): ModelProvider {
  return modelDrivers.getProviderName(provider) as ModelProvider;
}

/** Resolve the default model for the active provider. */
export function getDefaultModel(provider?: string): string {
  return modelDrivers.getDefaultModel(provider);
}

/**
 * Resolve the driver for a provider, caching one instance per provider and
 * OpenAI endpoint variant.
 *
 * @param provider - provider name; defaults to the environment setting.
 * @throws when the provider is unknown.
 */
export function resolveModelDriver(provider?: string): ModelDriver {
  return modelDrivers.resolve(provider ?? currentProviderSetting());
}
