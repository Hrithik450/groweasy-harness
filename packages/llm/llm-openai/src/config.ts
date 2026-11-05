/**
 * Schemastery configuration for the OpenAI provider plugin.
 *
 * The schema mirrors `OpenAIConfig`; the adapter resolves the same shape
 * through the plain option resolver, so plugin and environment configuration
 * converge on one code path.
 *
 * @module @openai-harness/llm-openai/config
 */

import z from "@deepseek-ai/schemastery";
import {
  DEFAULT_API,
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORTS,
  type OpenAIConfig,
} from "./options";

/** Runtime schema for {@link OpenAIConfig}. */
export const Config = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  model: z.string().default(DEFAULT_MODEL),
  api: z.union(["responses", "chat"] as const).default(DEFAULT_API),
  reasoningEffort: z
    .union(REASONING_EFFORTS)
    .default(DEFAULT_REASONING_EFFORT),
}) as unknown as z<OpenAIConfig>;
