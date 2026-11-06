/**
 * Plain OpenAI provider options and resolution.
 *
 * Kept separate from the schemastery `Config` so the adapter and host shims
 * can resolve model ids and keys without loading the plugin configuration
 * layer. Environment values are read per call, matching the application's
 * long-standing behaviour where a changed `OPENAI_MODEL` applies to the next
 * request without reconstructing the driver.
 *
 * @module @openai-harness/llm-openai/options
 */

import type { ResponsesReasoningEffort } from "./responses";

/** Endpoint selection for the OpenAI provider. */
export type OpenAIApi = "responses" | "chat";

/** Default model used when neither config nor environment names one. */
export const DEFAULT_MODEL = "gpt-6.1-sol";

/** Default endpoint; Responses keeps function tools available on reasoning models. */
export const DEFAULT_API: OpenAIApi = "responses";

/** Default reasoning effort for the Responses endpoint. */
export const DEFAULT_REASONING_EFFORT: ResponsesReasoningEffort = "medium";

/** Reasoning efforts accepted by the Responses request mapper. */
export const REASONING_EFFORTS: readonly ResponsesReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];

/** Environment lookup used by the resolver (injectable for tests). */
export type OpenAIEnvironment = Readonly<Record<string, string | undefined>>;

/** Plain OpenAI provider settings. */
export interface OpenAIConfig {
  /** API key; falls back to `OPENAI_API_KEY` from the environment. */
  apiKey?: string;
  /** Optional endpoint root; falls back to `OPENAI_BASE_URL`. */
  baseURL?: string;
  /** Model id; falls back to `OPENAI_MODEL`, `OPENAI_AGENT_MODEL`, then the default. */
  model?: string;
  /** Endpoint selection; falls back to `OPENAI_API=chat`, then Responses. */
  api?: OpenAIApi;
  /** Responses reasoning effort; falls back to `OPENAI_REASONING_EFFORT`. */
  reasoningEffort?: ResponsesReasoningEffort;
}

/** Fully resolved settings captured for one model call. */
export interface ResolvedOpenAIOptions {
  apiKey: string | null;
  baseURL: string | undefined;
  model: string;
  api: OpenAIApi;
  reasoningEffort: ResponsesReasoningEffort;
}

/** Read the endpoint selection, defaulting to Responses. */
export function resolveOpenAIApi(environment: OpenAIEnvironment): OpenAIApi {
  return environment.OPENAI_API?.trim().toLowerCase() === "chat"
    ? "chat"
    : "responses";
}

/** Read a supported reasoning effort, falling back to the default. */
export function resolveOpenAIReasoningEffort(
  environment: OpenAIEnvironment,
): ResponsesReasoningEffort {
  const raw = environment.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  for (const effort of REASONING_EFFORTS) {
    if (raw === effort) return effort;
  }
  return DEFAULT_REASONING_EFFORT;
}

/**
 * Resolve every OpenAI setting for one call.
 *
 * Config values win over environment values; an unset key stays `null` so the
 * adapter can raise a configuration error instead of the SDK's generic
 * missing-key exception.
 *
 * @param config - plugin or programmatic overrides.
 * @param environment - process environment or a test snapshot.
 * @returns detached, fully resolved settings.
 */
export function resolveOpenAIOptions(
  config: OpenAIConfig = {},
  environment: OpenAIEnvironment = process.env,
): ResolvedOpenAIOptions {
  const apiKey =
    config.apiKey?.trim() || environment.OPENAI_API_KEY?.trim() || null;
  const baseURL =
    config.baseURL?.trim() || environment.OPENAI_BASE_URL?.trim() || undefined;

  return {
    apiKey: apiKey && apiKey.length > 0 ? apiKey : null,
    baseURL,
    model:
      config.model?.trim() ||
      environment.OPENAI_MODEL?.trim() ||
      environment.OPENAI_AGENT_MODEL?.trim() ||
      DEFAULT_MODEL,
    api: config.api ?? resolveOpenAIApi(environment),
    reasoningEffort:
      config.reasoningEffort ?? resolveOpenAIReasoningEffort(environment),
  };
}
