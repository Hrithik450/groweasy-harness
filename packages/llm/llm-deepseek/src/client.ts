/**
 * DeepSeek SDK client construction and reuse.
 *
 * DeepSeek speaks the OpenAI Chat Completions protocol, so it reuses the
 * OpenAI SDK with a DeepSeek endpoint. The adapter resolves options per call,
 * so the client is cached by the facts that construct it: an API-key or
 * base-URL change creates a fresh SDK client while every unchanged call reuses
 * the existing one.
 *
 * @module @openai-harness/llm-deepseek/client
 */

import OpenAI from "openai";
import { resolveDeepSeekOptions, type ResolvedDeepSeekOptions } from "./config";

/** Concrete SDK client used by the DeepSeek adapter. */
export type DeepSeekClient = OpenAI;

/** Test seam that replaces SDK construction. */
export type DeepSeekClientFactory = (
  options: ResolvedDeepSeekOptions,
) => DeepSeekClient | null;

let clientInstance: DeepSeekClient | null = null;
let clientKey: string | null = null;

/**
 * Build or reuse the SDK client for one resolved configuration.
 * @param options - resolved settings for the current call.
 * @returns the client, or `null` when no API key is configured.
 */
export function createDeepSeekClient(
  options: ResolvedDeepSeekOptions,
): DeepSeekClient | null {
  if (options.apiKey === null) return null;

  const key = `${options.apiKey}\u0000${options.baseURL}`;
  if (clientInstance === null || clientKey !== key) {
    clientInstance = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    clientKey = key;
  }
  return clientInstance;
}

/**
 * Resolve the environment-configured client.
 *
 * Returns `null` when no API key is configured so callers can raise a clear
 * configuration error instead of the SDK's generic missing-key exception.
 *
 * @param environment - process environment or a test snapshot.
 * @returns the cached client, or `null` without an API key.
 */
export function getDeepSeekClient(
  environment: NodeJS.ProcessEnv = process.env,
): DeepSeekClient | null {
  return createDeepSeekClient(resolveDeepSeekOptions({}, environment));
}
