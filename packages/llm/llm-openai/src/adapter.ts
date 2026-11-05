/**
 * OpenAI model driver.
 *
 * One adapter serves both OpenAI endpoints. Chat Completions and Responses
 * differ only in their request mapper and stream translator, so the adapter
 * resolves the endpoint per call and delegates; the canonical message and
 * frame vocabulary stays in {@link ModelDriver}.
 *
 * @module @openai-harness/llm-openai/adapter
 */

import type {
  ModelDriver,
  ModelFrame,
  ModelStreamInput,
} from "@openai-harness/llm";
import {
  streamChatCompletionFrames,
  toChatCompletionRequest,
} from "./chat-completions";
import {
  createOpenAIClient,
  type OpenAIClientFactory,
} from "./client";
import {
  resolveOpenAIOptions,
  type OpenAIApi,
  type OpenAIConfig,
} from "./options";
import { encodeImages, type LoadRequestImage } from "./images";
import { streamResponsesFrames, toResponsesRequest } from "./responses";

/** Non-serializable adapter dependencies supplied by the host. */
export interface OpenAIDependencies {
  /** Static overrides; environment values fill every unset field per call. */
  config?: OpenAIConfig;
  /** Pins this adapter to one endpoint; otherwise config/environment select it. */
  api?: OpenAIApi;
  /** Resolves attachment bytes; omit to send image envelopes as text. */
  loadImage?: LoadRequestImage;
  /** Test seam replacing the module-level SDK client. */
  createClient?: OpenAIClientFactory;
}

/** OpenAI provider adapter implementing the canonical driver contract. */
export class OpenAIAdapter implements ModelDriver {
  constructor(private readonly dependencies: OpenAIDependencies = {}) {}

  async *stream(input: ModelStreamInput): AsyncGenerator<ModelFrame> {
    const options = resolveOpenAIOptions(
      {
        ...this.dependencies.config,
        ...(this.dependencies.api === undefined
          ? {}
          : { api: this.dependencies.api }),
      },
      process.env,
    );
    const client = (this.dependencies.createClient ?? createOpenAIClient)(options);
    if (client === null) {
      throw new Error(
        "OpenAI API key is missing or not configured. Please add OPENAI_API_KEY to your environment.",
      );
    }

    const encodedImages = await encodeImages(input.messages, {
      model: options.model,
      tenantId: input.tenantId,
      loadImage: this.dependencies.loadImage,
    });

    // A provider that accepts the request and then never answers would hold
    // the turn open forever with the SDK's default ten-minute budget, so model
    // requests get an explicit bound; the timeout covers the wait for response
    // headers, not the stream itself.
    const requestOptions = {
      signal: input.signal,
      timeout: requestTimeoutMs(),
      maxRetries: 1,
    };

    if (options.api === "chat") {
      const stream = await client.chat.completions.create(
        toChatCompletionRequest(
          {
            model: options.model,
            messages: input.messages,
            tools: input.tools,
          },
          encodedImages,
        ),
        requestOptions,
      );
      yield* streamChatCompletionFrames(stream);
      return;
    }

    const stream = await client.responses.create(
      toResponsesRequest(
        {
          model: options.model,
          messages: input.messages,
          tools: input.tools,
          reasoningEffort: options.reasoningEffort,
        },
        encodedImages,
      ),
      requestOptions,
    );
    yield* streamResponsesFrames(stream);
  }
}

/** Default bound on one model request's wait for response headers. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Read the model-request timeout, falling back to the default.
 * @returns a positive whole number of milliseconds.
 */
function requestTimeoutMs(): number {
  const raw = process.env.OPENAI_REQUEST_TIMEOUT_MS?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

/**
 * Build the Chat Completions driver.
 * @param dependencies - host-supplied image loader and test seams.
 * @returns one adapter pinned to the Chat Completions endpoint.
 */
export function createOpenAIChatDriver(
  dependencies: OpenAIDependencies = {},
): ModelDriver {
  return new OpenAIAdapter({ ...dependencies, api: "chat" });
}

/**
 * Build the Responses driver.
 * @param dependencies - host-supplied image loader and test seams.
 * @returns one adapter pinned to the Responses endpoint.
 */
export function createOpenAIResponsesDriver(
  dependencies: OpenAIDependencies = {},
): ModelDriver {
  return new OpenAIAdapter({ ...dependencies, api: "responses" });
}
