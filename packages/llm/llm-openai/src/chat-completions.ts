/**
 * Shared Chat Completions wire mapping.
 *
 * OpenAI and DeepSeek both speak the Chat Completions protocol, so the canonical
 * message/tool translation and the streamed-chunk translation live here and are
 * reused by every Chat-Completions-backed driver. Nothing in this module imports
 * an SDK; the structural types below are the subset of the wire format the
 * drivers read and write.
 *
 * @module @openai-harness/llm-openai/chat-completions
 */

import type {
  ContentBlock,
  Message,
  ModelFrame,
  ModelToolSchema,
  ToolCallBlock,
} from "@openai-harness/llm";
import {
  encodedImageDataUrl,
  type EncodedImageMap,
} from "./images";

/** One function call on an assistant wire message. */
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
  messages: readonly Message[];
  tools?: readonly ModelToolSchema[];
}

/** Project rich content blocks to the text the provider wire accepts. */
export function blocksToText(blocks: readonly ContentBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        parts.push(block.text);
        break;
      case "block":
        parts.push(`[Rendered UI Block: ${block.spec.root}]`);
        break;
      case "image": {
        const alt = block.alt ? ` (${block.alt})` : "";
        parts.push(`[Image attachment id="${block.ref.attachmentId}"${alt}]`);
        break;
      }
      case "file": {
        const filename = block.filename ? ` (${block.filename})` : "";
        parts.push(
          `[File attachment id="${block.ref.attachmentId}"${filename}]`,
        );
        break;
      }
      case "tool-call":
      case "reasoning":
        // Tool calls map separately; reasoning is not replayed.
        break;
    }
  }

  return parts.join("\n\n").trim();
}

/** Collect assistant tool-call blocks in model order. */
function toolCallsFrom(
  blocks: readonly ContentBlock[],
): ChatCompletionToolCall[] {
  return blocks
    .filter((block): block is ToolCallBlock => block.type === "tool-call")
    .map((block) => ({
      id: String(block.id),
      type: "function",
      function: { name: block.name, arguments: block.arguments },
    }));
}

/** Render blocks to text while dropping images that have encoded bytes. */
function textWithoutEncodedImages(
  blocks: readonly ContentBlock[],
  encodedImages: EncodedImageMap | undefined,
): string {
  if (!encodedImages || encodedImages.size === 0) return blocksToText(blocks);
  return blocksToText(
    blocks.filter(
      (block) =>
        !(
          block.type === "image" &&
          encodedImages.has(block.ref.attachmentId)
        ),
    ),
  );
}

/** Project encodable image blocks to provider content parts. */
function imageContentParts(
  blocks: readonly ContentBlock[],
  encodedImages: EncodedImageMap | undefined,
): ChatCompletionContentPart[] {
  if (!encodedImages || encodedImages.size === 0) return [];
  const parts: ChatCompletionContentPart[] = [];

  for (const block of blocks) {
    if (block.type !== "image") continue;
    const image = encodedImages.get(block.ref.attachmentId);
    if (!image) continue;
    parts.push({
      type: "image_url",
      image_url: { url: encodedImageDataUrl(image), detail: "auto" },
    });
  }

  return parts;
}

export function toolResultImageEnvelope(
  callId: string,
  count: number,
): string {
  const noun = count === 1 ? "image" : "images";
  return `<tool-result-images call_id="${callId}">${count} ${noun} returned by this tool call.</tool-result-images>`;
}

/** Map one canonical message to zero or more Chat Completions messages. */
function toChatMessage(
  message: Message,
  encodedImages?: EncodedImageMap,
): ChatCompletionMessage[] {
  switch (message.role) {
    case "system": {
      const content =
        typeof message.content === "string"
          ? message.content
          : blocksToText(message.content);
      return [{ role: "system", content }];
    }
    case "user": {
      const text = textWithoutEncodedImages(message.content, encodedImages);
      const images = imageContentParts(message.content, encodedImages);
      if (images.length === 0) {
        return [{ role: "user", content: text }];
      }
      const parts: ChatCompletionContentPart[] = [];
      if (text.length > 0) parts.push({ type: "text", text });
      parts.push(...images);
      return [{ role: "user", content: parts }];
    }
    case "assistant": {
      // Assistant images are never replayed.
      const content = blocksToText(message.content);
      const toolCalls = toolCallsFrom(message.content);
      if (toolCalls.length === 0) {
        return [{ role: "assistant", content }];
      }
      return [
        {
          role: "assistant",
          content: content.length > 0 ? content : null,
          tool_calls: toolCalls,
        },
      ];
    }
    case "tool": {
      const blocks =
        typeof message.content === "string"
          ? [{ type: "text" as const, text: message.content }]
          : message.content;
      const content = textWithoutEncodedImages(blocks, encodedImages);
      const images = imageContentParts(blocks, encodedImages);

      const toolMessage: ChatCompletionMessage = {
        role: "tool",
        tool_call_id: String(message.toolCallId),
        content,
      };

      if (images.length === 0) return [toolMessage];

      // A tool-role message must stay a string on this API. Carry the images
      // in an adjacent user message instead.
      const parts: ChatCompletionContentPart[] = [
        {
          type: "text",
          text: toolResultImageEnvelope(
            String(message.toolCallId),
            images.length,
          ),
        },
        ...images,
      ];
      return [toolMessage, { role: "user", content: parts }];
    }
  }
}

/** Map canonical messages to Chat Completions messages. */
export function toChatMessages(
  messages: readonly Message[],
  encodedImages?: EncodedImageMap,
): ChatCompletionMessage[] {
  return messages.flatMap((message) => toChatMessage(message, encodedImages));
}

/** Map one canonical function schema to a Chat Completions tool. */
function toChatTool(tool: ModelToolSchema): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

/** Map canonical function schemas to Chat Completions tools. */
export function toChatTools(
  tools: readonly ModelToolSchema[],
): ChatCompletionTool[] {
  return tools.map(toChatTool);
}

/**
 * Build the shared streaming request body.
 *
 * Tool fields are omitted entirely when there are no tools, matching the
 * providers' preference for an absent `tools` key over an empty array.
 */
export function toChatCompletionRequest(
  input: ChatCompletionRequestInput,
  encodedImages?: EncodedImageMap,
): ChatCompletionRequest {
  const tools = toChatTools(input.tools ?? []);
  return {
    model: input.model,
    messages: toChatMessages(input.messages, encodedImages),
    ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    stream: true,
    stream_options: { include_usage: true },
  };
}

/** Result of translating one streamed chunk. */
export interface ChatCompletionTranslation {
  frames: ModelFrame[];
  finishReason: string | null;
}

/**
 * Translate one Chat Completion chunk into normalized frames.
 *
 * `finishReason` threads through chunks because providers may report an empty
 * `choices` array (usage-only chunk) after the choice that carried the reason.
 */
export function translateChatCompletionChunk(
  chunk: ChatCompletionChunk,
  finishReason: string | null = null,
): ChatCompletionTranslation {
  const frames: ModelFrame[] = [];
  let nextFinishReason = finishReason;

  if (chunk.usage) {
    frames.push({
      type: "usage",
      usage: {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
        totalTokens: chunk.usage.total_tokens,
      },
    });
  }

  for (const choice of chunk.choices) {
    const delta = choice.delta;

    if (delta.content) {
      frames.push({ type: "text-delta", delta: delta.content });
    }

    const reasoning = delta.reasoning ?? delta.reasoning_content;
    if (reasoning) {
      frames.push({ type: "reasoning-delta", delta: reasoning });
    }

    for (const call of delta.tool_calls ?? []) {
      frames.push({
        type: "tool-call-delta",
        index: call.index,
        ...(call.id !== undefined ? { id: call.id } : {}),
        ...(call.function?.name !== undefined
          ? { name: call.function.name }
          : {}),
        ...(call.function?.arguments !== undefined
          ? { argumentsDelta: call.function.arguments }
          : {}),
      });
    }

    if (choice.finish_reason) {
      nextFinishReason = choice.finish_reason;
    }
  }

  return { frames, finishReason: nextFinishReason };
}

/** Build the terminal frame for a completed stream. */
export function chatCompletionDoneFrame(
  finishReason: string | null,
): ModelFrame {
  return { type: "done", finishReason };
}

/**
 * Translate a whole Chat Completions stream into normalized frames.
 *
 * The final `done` frame is emitted once, after the provider stream ends, using
 * the last finish reason observed.
 */
export async function* streamChatCompletionFrames(
  stream: AsyncIterable<ChatCompletionChunk>,
): AsyncGenerator<ModelFrame> {
  let finishReason: string | null = null;

  for await (const chunk of stream) {
    const translation = translateChatCompletionChunk(chunk, finishReason);
    finishReason = translation.finishReason;
    for (const frame of translation.frames) {
      yield frame;
    }
  }

  yield chatCompletionDoneFrame(finishReason);
}
