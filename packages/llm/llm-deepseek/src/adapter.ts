/**
 * DeepSeek Chat Completions driver.
 *
 * DeepSeek exposes an OpenAI-compatible Chat Completions API, so the adapter
 * reuses the shared wire mapper and frame translator from
 * `@openai-harness/llm-openai` and only supplies its own client, base URL, and
 * model defaults.
 *
 * @module @openai-harness/llm-deepseek/adapter
 */

import type {
  ModelDriver,
  ModelFrame,
  ModelStreamInput,
} from "@openai-harness/llm";
import {
  encodeImages,
  streamChatCompletionFrames,
  toChatCompletionRequest,
  type LoadRequestImage,
} from "@openai-harness/llm-openai";
import {
  createDeepSeekClient,
  type DeepSeekClientFactory,
} from "./client";
import { resolveDeepSeekOptions, type DeepSeekConfig } from "./config";

/** Non-serializable adapter dependencies supplied by the host. */
export interface DeepSeekDependencies {
  /** Static overrides; environment values fill every unset field per call. */
  config?: DeepSeekConfig;
  /** Resolves attachment bytes; omit to send image envelopes as text. */
  loadImage?: LoadRequestImage;
  /** Test seam replacing the module-level SDK client. */
  createClient?: DeepSeekClientFactory;
}

/** DeepSeek provider adapter implementing the canonical driver contract. */
export class DeepSeekAdapter implements ModelDriver {
  constructor(private readonly dependencies: DeepSeekDependencies = {}) {}

  async *stream(input: ModelStreamInput): AsyncGenerator<ModelFrame> {
    const options = resolveDeepSeekOptions(
      this.dependencies.config,
      process.env,
    );
    const client = (this.dependencies.createClient ?? createDeepSeekClient)(
      options,
    );
    if (client === null) {
      throw new Error(
        "DeepSeek API key is missing or not configured. Please add DEEPSEEK_API_KEY to your environment.",
      );
    }

    const encodedImages = await encodeImages(input.messages, {
      model: options.model,
      tenantId: input.tenantId,
      loadImage: this.dependencies.loadImage,
    });

    const stream = await client.chat.completions.create(
      toChatCompletionRequest(
        {
          model: options.model,
          messages: input.messages,
          tools: input.tools,
        },
        encodedImages,
      ),
      { signal: input.signal },
    );

    yield* streamChatCompletionFrames(stream);
  }
}

/**
 * Build a DeepSeek Chat Completions driver.
 * @param dependencies - host-supplied image loader and test seams.
 * @returns one adapter bound to the DeepSeek client.
 */
export function createDeepSeekChatDriver(
  dependencies: DeepSeekDependencies = {},
): ModelDriver {
  return new DeepSeekAdapter(dependencies);
}

/** Process-wide DeepSeek Chat Completions implementation of {@link ModelDriver}. */
export const deepSeekChatDriver: ModelDriver = new DeepSeekAdapter();
