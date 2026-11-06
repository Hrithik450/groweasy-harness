/**
 * Shared Responses API wire mapping.
 *
 * The canonical message/tool translation and the streamed-event translation
 * live here. Nothing in this module imports an SDK; the structural types below
 * are the subset of the wire format the drivers read and write.
 *
 * Requests are stateless: the full message history is replayed on every call
 * and `store` is always `false`. Provider reasoning items are intentionally not
 * replayed in this version (only their text deltas are surfaced to the caller).
 *
 * @module @openai-harness/llm-openai/responses
 */

import type {
  ContentBlock,
  Message,
  ModelFrame,
  ModelToolSchema,
} from "@openai-harness/llm";
import {
  blocksToText,
  toolResultImageEnvelope,
} from "./chat-completions";
import { encodedImageDataUrl, type EncodedImageMap } from "./images";

/** Reasoning efforts accepted by the Responses API for this harness. */
export type ResponsesReasoningEffort = "low" | "medium" | "high" | "xhigh";

/** One content part accepted by a multimodal Responses user item. */
export type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "auto" };

/** One flat Responses input item emitted by this harness. */
export type ResponseInputItem =
  | { role: "system" | "assistant"; content: string }
  | { role: "user"; content: string }
  | { role: "user"; content: ResponsesContentPart[] }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

/** One flat Responses function tool. */
export interface ResponsesFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: false;
}

/** Reasoning configuration on a Responses request. */
export interface ResponsesReasoningConfig {
  effort: ResponsesReasoningEffort;
}

/** Streaming Responses request body. */
export interface ResponsesRequest {
  model: string;
  input: ResponseInputItem[];
  tools?: ResponsesFunctionTool[];
  reasoning?: ResponsesReasoningConfig;
  store: false;
  stream: true;
}

/** Inputs needed to build a streaming Responses request. */
export interface ResponsesRequestInput {
  model: string;
  messages: readonly Message[];
  tools?: readonly ModelToolSchema[];
  reasoningEffort?: ResponsesReasoningEffort;
}

/** Project a canonical string-or-block content value to wire text. */
function contentToText(content: string | readonly ContentBlock[]): string {
  return typeof content === "string" ? content : blocksToText(content);
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

/** Project encodable image blocks to Responses content parts. */
function inputImageParts(
  blocks: readonly ContentBlock[],
  encodedImages: EncodedImageMap | undefined,
): ResponsesContentPart[] {
  if (!encodedImages || encodedImages.size === 0) return [];
  const parts: ResponsesContentPart[] = [];

  for (const block of blocks) {
    if (block.type !== "image") continue;
    const image = encodedImages.get(block.ref.attachmentId);
    if (!image) continue;
    parts.push({
      type: "input_image",
      image_url: encodedImageDataUrl(image),
      detail: "auto",
    });
  }

  return parts;
}

/** Map one canonical message to zero or more flat Responses input items. */
function toInputItems(
  message: Message,
  encodedImages?: EncodedImageMap,
): ResponseInputItem[] {
  switch (message.role) {
    case "system":
      return [{ role: "system", content: contentToText(message.content) }];
    case "user": {
      const text = textWithoutEncodedImages(message.content, encodedImages);
      const images = inputImageParts(message.content, encodedImages);
      if (images.length === 0) {
        return [{ role: "user", content: text }];
      }
      const parts: ResponsesContentPart[] = [];
      if (text.length > 0) parts.push({ type: "input_text", text });
      parts.push(...images);
      return [{ role: "user", content: parts }];
    }
    case "assistant": {
      // Assistant images are never replayed.
      const items: ResponseInputItem[] = [];
      const text = blocksToText(message.content);
      if (text.length > 0) {
        items.push({ role: "assistant", content: text });
      }
      for (const block of message.content) {
        if (block.type === "tool-call") {
          items.push({
            type: "function_call",
            call_id: String(block.id),
            name: block.name,
            arguments: block.arguments,
          });
        }
      }
      return items;
    }
    case "tool": {
      const blocks =
        typeof message.content === "string"
          ? [{ type: "text" as const, text: message.content }]
          : message.content;
      const output = textWithoutEncodedImages(blocks, encodedImages);
      const images = inputImageParts(blocks, encodedImages);

      const items: ResponseInputItem[] = [
        {
          type: "function_call_output",
          call_id: String(message.toolCallId),
          output,
        },
      ];

      if (images.length > 0) {
        // function_call_output must stay text-only; images ride the next
        // user item with a correlation envelope.
        const parts: ResponsesContentPart[] = [
          {
            type: "input_text",
            text: toolResultImageEnvelope(
              String(message.toolCallId),
              images.length,
            ),
          },
          ...images,
        ];
        items.push({ role: "user", content: parts });
      }

      return items;
    }
  }
}

/** Map canonical messages to flat Responses input items in order. */
export function toResponsesInput(
  messages: readonly Message[],
  encodedImages?: EncodedImageMap,
): ResponseInputItem[] {
  return messages.flatMap((message) => toInputItems(message, encodedImages));
}

/** Map one canonical function schema to a flat Responses tool. */
function toResponsesTool(tool: ModelToolSchema): ResponsesFunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  };
}

/** Map canonical function schemas to flat Responses tools. */
export function toResponsesTools(
  tools: readonly ModelToolSchema[],
): ResponsesFunctionTool[] {
  return tools.map(toResponsesTool);
}

/**
 * Build the streaming request body.
 *
 * Tool and reasoning fields are omitted entirely when absent, matching the
 * provider's preference for absent keys over empty values.
 */
export function toResponsesRequest(
  input: ResponsesRequestInput,
  encodedImages?: EncodedImageMap,
): ResponsesRequest {
  const tools = toResponsesTools(input.tools ?? []);
  return {
    model: input.model,
    input: toResponsesInput(input.messages, encodedImages),
    ...(tools.length > 0 ? { tools } : {}),
    ...(input.reasoningEffort !== undefined
      ? { reasoning: { effort: input.reasoningEffort } }
      : {}),
    store: false,
    stream: true,
  };
}

/** Output item subset read from `response.output_item.added`. */
export interface ResponsesOutputItem {
  type?: string;
  id?: unknown;
  call_id?: unknown;
  name?: unknown;
}

/** Terminal output item subset read from `response.completed`. */
export interface ResponsesOutputSnapshotItem {
  type?: string;
}

/** Token usage reported by a completed response. */
export interface ResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/** Completed/failed response subset the translator reads. */
export interface ResponsesResponse {
  usage?: ResponsesUsage | null;
  output?: readonly ResponsesOutputSnapshotItem[];
  error?: { message?: unknown } | null;
}

/**
 * The structural subset of `ResponseStreamEvent` this layer consumes.
 *
 * Fields are typed broadly so every SDK event variant remains assignable; the
 * translator narrows them before use. Unknown event types are ignored.
 */
export interface ResponsesStreamEvent {
  type: string;
  delta?: unknown;
  item_id?: unknown;
  output_index?: unknown;
  item?: ResponsesOutputItem;
  message?: unknown;
  response?: ResponsesResponse;
}

/** Read an optional numeric field from a wire event. */
function numeric(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Read an optional string field from a wire event. */
function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Stateful translator from Responses stream events to normalized frames.
 *
 * One instance belongs to one stream; it remembers function-call output
 * indices so argument deltas can be attributed even when an event omits
 * `output_index`.
 */
export class ResponsesStreamTranslator {
  private readonly indexByItemId = new Map<string, number>();
  private completed = false;
  private finishReason: string | null = null;

  /** Translate one provider event into zero or more normalized frames. */
  translate(event: ResponsesStreamEvent): ModelFrame[] {
    switch (event.type) {
      case "response.output_item.added": {
        const item = event.item;
        if (!item || item.type !== "function_call") {
          return [];
        }
        const index = numeric(event.output_index) ?? 0;
        const itemId = text(item.id);
        if (itemId !== undefined) {
          this.indexByItemId.set(itemId, index);
        }
        const frame: ModelFrame = { type: "tool-call-delta", index };
        const callId = text(item.call_id);
        if (callId !== undefined) {
          frame.id = callId;
        }
        const name = text(item.name);
        if (name !== undefined) {
          frame.name = name;
        }
        return [frame];
      }
      case "response.function_call_arguments.delta": {
        const delta = text(event.delta);
        if (delta === undefined) {
          return [];
        }
        const itemId = text(event.item_id);
        const index =
          numeric(event.output_index) ??
          (itemId === undefined ? undefined : this.indexByItemId.get(itemId)) ??
          0;
        return [{ type: "tool-call-delta", index, argumentsDelta: delta }];
      }
      case "response.output_text.delta": {
        const delta = text(event.delta);
        return delta === undefined ? [] : [{ type: "text-delta", delta }];
      }
      case "response.reasoning_text.delta":
      case "response.reasoning_summary_text.delta": {
        const delta = text(event.delta);
        return delta === undefined ? [] : [{ type: "reasoning-delta", delta }];
      }
      case "response.completed": {
        const frames: ModelFrame[] = [];
        const response = event.response;
        if (response?.usage) {
          frames.push({
            type: "usage",
            usage: {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens: response.usage.total_tokens,
            },
          });
        }
        const calledTool =
          response?.output?.some((item) => item.type === "function_call") ??
          false;
        this.finishReason = calledTool ? "tool_calls" : "stop";
        frames.push({ type: "done", finishReason: this.finishReason });
        this.completed = true;
        return frames;
      }
      case "response.failed": {
        throw new Error(
          text(event.response?.error?.message) ?? "OpenAI response failed.",
        );
      }
      case "error": {
        throw new Error(text(event.message) ?? "OpenAI response stream error.");
      }
      default:
        return [];
    }
  }

  /** Whether a terminal `response.completed` event has been observed. */
  get isCompleted(): boolean {
    return this.completed;
  }

  /** Finish reason reported by the completed response, if any. */
  get currentFinishReason(): string | null {
    return this.finishReason;
  }
}

/**
 * Translate a whole Responses stream into normalized frames.
 *
 * `response.completed` yields the terminal `done` frame. If the stream ends
 * without one (for example an abort), a `done` frame with the last observed
 * finish reason is emitted once.
 */
export async function* streamResponsesFrames(
  stream: AsyncIterable<ResponsesStreamEvent>,
): AsyncGenerator<ModelFrame> {
  const translator = new ResponsesStreamTranslator();

  for await (const event of stream) {
    for (const frame of translator.translate(event)) {
      yield frame;
    }
  }

  if (!translator.isCompleted) {
    yield { type: "done", finishReason: translator.currentFinishReason };
  }
}
