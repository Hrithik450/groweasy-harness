/**
 * OpenAI SDK client construction and reuse.
 *
 * Provider adapters resolve options per call, so the client is cached by the
 * facts that construct it: an API-key or base-URL change creates a fresh SDK
 * client while every unchanged call reuses the existing one.
 *
 * @module @openai-harness/llm-openai/client
 */

import OpenAI from "openai";
import type { ResolvedOpenAIOptions } from "./options";

/** Concrete OpenAI SDK client used by the adapters. */
export type OpenAIClient = OpenAI;

/** Test seam that replaces SDK construction. */
export type OpenAIClientFactory = (
  options: ResolvedOpenAIOptions,
) => OpenAIClient | null;

let clientInstance: OpenAIClient | null = null;
let clientKey: string | null = null;

/**
 * Build or reuse the SDK client for one resolved configuration.
 * @param options - resolved settings for the current call.
 * @returns the client, or `null` when no API key is configured.
 */
export function createOpenAIClient(
  options: ResolvedOpenAIOptions,
): OpenAIClient | null {
  if (options.apiKey === null) return null;

  const key = `${options.apiKey}\u0000${options.baseURL ?? ""}`;
  if (clientInstance === null || clientKey !== key) {
    clientInstance = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    });
    clientKey = key;
  }
  return clientInstance;
}
