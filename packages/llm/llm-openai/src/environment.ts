/**
 * Environment-bound convenience accessors for the OpenAI provider.
 *
 * Provider packages that call OpenAI directly (image, video, subtitle tools)
 * need the same client and model ids the gateway resolves from its
 * environment. The resolution itself stays in {@link resolveOpenAIOptions} and
 * the client cache in {@link createOpenAIClient}, so these functions are thin
 * wrappers rather than a second configuration path.
 *
 * @module @openai-harness/llm-openai/environment
 */

import type { OpenAIClient } from "./client";
import { createOpenAIClient } from "./client";
import {
  DEFAULT_MODEL,
  resolveOpenAIOptions,
  type OpenAIEnvironment,
} from "./options";

/** Embedding model used when `OPENAI_EMBEDDING_MODEL` is unset. */
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * The process-wide SDK client for the current environment settings.
 *
 * @param environment - process environment or a test snapshot.
 * @returns the cached client, or `null` when no API key is configured.
 */
export function getOpenAIClient(
  environment: OpenAIEnvironment = process.env,
): OpenAIClient | null {
  return createOpenAIClient(resolveOpenAIOptions({}, environment));
}

/**
 * Model id for chat and Responses calls.
 *
 * @param environment - process environment or a test snapshot.
 * @returns `OPENAI_MODEL`, then `OPENAI_AGENT_MODEL`, then the default.
 */
export function getOpenAIModel(
  environment: OpenAIEnvironment = process.env,
): string {
  return resolveOpenAIOptions({}, environment).model || DEFAULT_MODEL;
}

/**
 * Model id for embeddings.
 *
 * @param environment - process environment or a test snapshot.
 * @returns `OPENAI_EMBEDDING_MODEL`, then the default.
 */
export function getOpenAIEmbeddingModel(
  environment: OpenAIEnvironment = process.env,
): string {
  return environment.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}
