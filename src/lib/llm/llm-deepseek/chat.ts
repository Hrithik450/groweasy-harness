/**
 * DeepSeek Chat Completions driver.
 *
 * DeepSeek speaks the same Chat Completions wire format as OpenAI, so request
 * mapping and stream translation are shared with `openai.chat`.
 *
 * @module @/lib/llm/llm-deepseek/chat
 */

import OpenAI from "openai";
import {
  streamChatCompletionFrames,
  toChatCompletionRequest,
} from "@/lib/llm/llm/chat-completions";
import type { ModelDriver, ModelFrame, ModelStreamInput } from "@/lib/llm/llm/driver";

/** Default model used when `DEEPSEEK_MODEL` is not configured. */
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

/** Resolve the configured DeepSeek model name. */
export function getDeepSeekModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
}

let deepSeekClient: OpenAI | null = null;

/** Return the cached DeepSeek client, creating it on first use. */
function getDeepSeekClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "DeepSeek API key is missing. Set DEEPSEEK_API_KEY to use the deepseek provider.",
    );
  }

  if (!deepSeekClient) {
    deepSeekClient = new OpenAI({
      apiKey,
      baseURL:
        process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    });
  }
  return deepSeekClient;
}

/** DeepSeek Chat Completions implementation of {@link ModelDriver}. */
export const deepSeekChatDriver: ModelDriver = {
  async *stream(input: ModelStreamInput): AsyncGenerator<ModelFrame> {
    const stream = await getDeepSeekClient().chat.completions.create(
      toChatCompletionRequest({
        model: getDeepSeekModel(),
        messages: input.messages,
        tools: input.tools,
      }),
      { signal: input.signal },
    );

    yield* streamChatCompletionFrames(stream);
  },
};
