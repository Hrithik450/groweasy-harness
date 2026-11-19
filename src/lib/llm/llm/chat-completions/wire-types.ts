/**
 * The structural subset of the Chat Completions wire format these drivers
 * read and write. No SDK types appear here: the drivers narrow these shapes
 * themselves, so an SDK upgrade cannot ripple through the mapping layer.
 *
 * @module @/lib/llm/llm/chat-completions/wire-types
 */

import type { ModelMessage, ModelToolSchema } from "@/lib/llm/llm/driver";

export interface ChatCompletionToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** One content part accepted by a multimodal Chat Completions user message. */
export type ChatCompletionContentPart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string; detail: "auto" };
    };

/** One Chat Completions wire message. */
export type ChatCompletionMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ChatCompletionContentPart[] }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ChatCompletionToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

/** One Chat Completions function tool. */
export interface ChatCompletionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Tool-call delta carried by one streamed chunk. */
export interface ChatCompletionDeltaToolCall {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/** Assistant delta carried by one streamed chunk. */
export interface ChatCompletionDelta {
  content?: string | null;
  reasoning?: string | null;
  reasoning_content?: string | null;
  tool_calls?: readonly ChatCompletionDeltaToolCall[];
}

/** Token usage reported by a terminal (or trailing) streamed chunk. */
export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * The structural subset of `ChatCompletionChunk` this layer consumes.
 *
 * Providers differ in whether they report `reasoning` or `reasoning_content`,
 * so both fields are accepted.
 */
export interface ChatCompletionChunk {
  usage?: ChatCompletionUsage | null;
  choices: readonly {
    delta: ChatCompletionDelta;
    finish_reason?: string | null;
  }[];
}

/** Request body shared by every Chat-Completions-backed driver. */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  tools?: ChatCompletionTool[];
  tool_choice?: "auto";
  stream: true;
  stream_options: { include_usage: true };
}

/** Inputs needed to build a streaming Chat Completions request. */
export interface ChatCompletionRequestInput {
  model: string;
  messages: readonly ModelMessage[];
  tools?: readonly ModelToolSchema[];
}

