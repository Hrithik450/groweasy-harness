/**
 * Plain DeepSeek provider options and resolution.
 *
 * DeepSeek exposes an OpenAI-compatible Chat Completions API, so the adapter
 * only needs an API key, a base URL, and a model id. Kept separate from the
 * schemastery `Config` so the adapter and host wiring can resolve settings
 * without loading the plugin configuration layer; environment values are read
 * per call, matching the application's long-standing behaviour where a changed
 * `DEEPSEEK_MODEL` applies to the next request without reconstructing the
 * driver.
 *
 * @module @openai-harness/llm-deepseek/config
 */

import z from "@deepseek-ai/schemastery";

/** Provider route owned by this package. */
export const DEEPSEEK_PROVIDER = "deepseek";

/** Public DeepSeek API root used when no environment value overrides it. */
export const DEFAULT_BASE_URL = "https://api.deepseek.com";

/** Default model used when neither config nor environment names one. */
export const DEFAULT_MODEL = "deepseek-chat";

/** Environment lookup used by the resolver (injectable for tests). */
export type DeepSeekEnvironment = Readonly<
  Record<string, string | undefined>
>;

/** Plain DeepSeek provider settings. */
export interface DeepSeekConfig {
  /** API key; falls back to `DEEPSEEK_API_KEY` from the environment. */
  apiKey?: string;
  /** Optional endpoint root; falls back to `DEEPSEEK_BASE_URL`, then the public API. */
  baseURL?: string;
  /** Model id; falls back to `DEEPSEEK_MODEL`, then the default. */
  model?: string;
}

/** Fully resolved settings captured for one model call. */
export interface ResolvedDeepSeekOptions {
  apiKey: string | null;
  baseURL: string;
  model: string;
}

/**
 * Resolve every DeepSeek setting for one call.
 *
 * Config values win over environment values; an unset key stays `null` so the
 * adapter can raise a configuration error instead of the SDK's generic
 * missing-key exception.
 *
 * @param config - plugin or programmatic overrides.
 * @param environment - process environment or a test snapshot.
 * @returns detached, fully resolved settings.
 */
export function resolveDeepSeekOptions(
  config: DeepSeekConfig = {},
  environment: DeepSeekEnvironment = process.env,
): ResolvedDeepSeekOptions {
  const apiKey =
    config.apiKey?.trim() || environment.DEEPSEEK_API_KEY?.trim() || null;

  return {
    apiKey: apiKey && apiKey.length > 0 ? apiKey : null,
    baseURL:
      config.baseURL ?? environment.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL,
    model:
      config.model?.trim() ||
      environment.DEEPSEEK_MODEL?.trim() ||
      DEFAULT_MODEL,
  };
}

/**
 * Read the configured DeepSeek API key, or `null` when absent.
 * @param environment - process environment or a test snapshot.
 * @returns the trimmed key, or `null` when it is unset or blank.
 */
export function getDeepSeekApiKey(
  environment: DeepSeekEnvironment = process.env,
): string | null {
  return resolveDeepSeekOptions({}, environment).apiKey;
}

/**
 * Resolve the DeepSeek API base URL.
 * @param environment - process environment or a test snapshot.
 * @returns the configured base URL, or the public default.
 */
export function getDeepSeekBaseURL(
  environment: DeepSeekEnvironment = process.env,
): string {
  return resolveDeepSeekOptions({}, environment).baseURL;
}

/**
 * Resolve the DeepSeek model name.
 * @param environment - process environment or a test snapshot.
 * @returns the configured model, or the default.
 */
export function getDeepSeekModel(
  environment: DeepSeekEnvironment = process.env,
): string {
  return resolveDeepSeekOptions({}, environment).model;
}

/** Runtime schema for {@link DeepSeekConfig}. */
export const Config = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  model: z.string().default(DEFAULT_MODEL),
}) as unknown as z<DeepSeekConfig>;
