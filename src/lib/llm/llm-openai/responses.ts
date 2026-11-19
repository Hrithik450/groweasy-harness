/**
 * OpenAI Responses API (`/v1/responses`) driver.
 *
 * The harness owns the loop: turns, steps, tool scheduling, and the durable
 * event log all live in the agent loop. This module owns only one provider hop
 * — canonical messages in, normalized stream frames out.
 *
 * Requests are stateless: the full history is replayed on every call and
 * `store` is always `false`, so no server-side conversation state exists.
 *
 * @module @/lib/llm/llm-openai/responses
 */

import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { getOpenAIClient, getOpenAIModel } from "@/lib/core/agent/client";
import { getAttachmentStore } from "@/lib/attachments/host";
import type {
  ModelDriver,
  ModelFrame,
  ModelMessage,
  ModelStreamInput,
  ModelToolSchema,
} from "@/lib/llm/llm/driver";

/** Reasoning efforts accepted by the Responses API for this harness. */
export type ResponsesReasoningEffort = "low" | "medium" | "high" | "xhigh";

/** One input content part on the wire. */
export type ResponseContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

/** One flat Responses input item. */
export type ResponseInputItem =
  | {
      role: "system" | "user" | "assistant";
      content: string | ResponseContentPart[];
    }
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

/** Streaming Responses request body. */
export interface ResponsesRequest {
  model: string;
  input: ResponseInputItem[];
  instructions?: string;
  tools?: ResponsesFunctionTool[];
  reasoning?: { effort: ResponsesReasoningEffort };
  store: false;
  stream: true;
}

/** Inputs needed to build a streaming Responses request. */
export interface ResponsesRequestInput {
  model: string;
  messages: readonly ModelMessage[];
  tools?: readonly ModelToolSchema[];
  reasoningEffort?: ResponsesReasoningEffort;
}

/** Map one canonical message to zero or more flat Responses input items. */
function toInputItems(
  message: ModelMessage,
  imageUrls: ReadonlyMap<string, string>,
): ResponseInputItem[] {
  switch (message.role) {
    case "system":
      return [];
    case "user": {
      const images = message.images ?? [];
      const text = message.content ?? "";
      if (images.length === 0) return [{ role: "user", content: text }];
      // Pixels travel as data URLs; the text stays as their label.
      return [
        {
          role: "user",
          content: [
            ...(text.length > 0 ? [{ type: "input_text" as const, text }] : []),
            ...images.map((image) => ({
              type: "input_image" as const,
              image_url: imageUrls.get(String(image.attachmentId)) ?? "",
            })),
          ].filter((part) =>
            part.type === "input_text" ? true : part.image_url.length > 0,
          ),
        },
      ];
    }
    case "assistant": {
      const items: ResponseInputItem[] = [];
      if (message.content) {
        items.push({ role: "assistant", content: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        items.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: call.arguments,
        });
      }
      return items;
    }
    case "tool":
      return [
        {
          type: "function_call_output",
          call_id: message.toolCallId ?? "",
          output: message.content ?? "",
        },
      ];
  }
}

/** System prompts travel as `instructions`, not as replay items. */
function systemInstructions(messages: readonly ModelMessage[]): string {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => message.content ?? "")
    .filter((text) => text.length > 0)
    .join("\n\n");
}

/**
 * Pair every `function_call` with exactly one `function_call_output`.
 *
 * A cancelled or interrupted turn can persist a call without its result (and,
 * rarely, a result recorded under a stale id). The provider rejects any request
 * that replays either half alone, so the transcript is balanced here: missing
 * outputs are synthesized right after their call, and orphan or duplicate
 * outputs are dropped.
 */
type FunctionCallItem = Extract<ResponseInputItem, { type: "function_call" }>;
type FunctionOutputItem = Extract<
  ResponseInputItem,
  { type: "function_call_output" }
>;

function isFunctionCall(item: ResponseInputItem): item is FunctionCallItem {
  return "type" in item && item.type === "function_call";
}

function isFunctionOutput(item: ResponseInputItem): item is FunctionOutputItem {
  return "type" in item && item.type === "function_call_output";
}

function balanceToolPairs(items: ResponseInputItem[]): ResponseInputItem[] {
  const outputs = new Map<string, FunctionOutputItem>();
  for (const item of items) {
    if (!isFunctionOutput(item)) continue;
    if (!outputs.has(item.call_id)) outputs.set(item.call_id, item);
  }

  const balanced: ResponseInputItem[] = [];

  for (const item of items) {
    // Outputs are emitted beside their call, so a raw one is either a
    // duplicate or orphaned by a stale call id.
    if (isFunctionOutput(item)) continue;

    balanced.push(item);

    if (!isFunctionCall(item)) continue;
    balanced.push(
      outputs.get(item.call_id) ?? {
        type: "function_call_output",
        call_id: item.call_id,
        output:
          "Error: no result was recorded for this tool call (the turn was interrupted). Its outcome is unknown; verify external state before retrying a side-effecting tool.",
      },
    );
  }

  return balanced;
}

/** Map canonical messages to flat Responses input items in order. */
export function toResponsesInput(
  messages: readonly ModelMessage[],
  imageUrls: ReadonlyMap<string, string> = new Map(),
): ResponseInputItem[] {
  return balanceToolPairs(
    messages.flatMap((message) => toInputItems(message, imageUrls)),
  );
}

/** Inline image budget for one request; past it, images stay as text labels. */
const MAX_INLINE_IMAGE_BYTES = 16 * 1024 * 1024;

/** Bytes per prepared request image; the store re-encodes to fit. */
const IMAGE_TARGET = { width: 1024, height: 1024, maxBytes: 4 * 1024 * 1024 };

/**
 * Read every referenced image as a data URL.
 *
 * The provider fetches nothing from us, so bytes travel inline, exactly as the
 * reference adapter inlines image data under a byte budget.
 */
async function imageUrlsFor(
  messages: readonly ModelMessage[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const store = getAttachmentStore();
  let totalBytes = 0;

  for (const message of messages) {
    for (const image of message.images ?? []) {
      const key = String(image.attachmentId);
      if (urls.has(key)) continue;
      if (totalBytes >= MAX_INLINE_IMAGE_BYTES) continue;

      try {
        const prepared = await store.readImageRequest(image, IMAGE_TARGET);
        totalBytes += prepared.bytes;
        urls.set(
          key,
          `data:${prepared.mediaType};base64,${Buffer.from(prepared.data).toString("base64")}`,
        );
      } catch (error) {
        // A missing image must not fail the turn; the text label remains.
        console.warn(
          `[Responses] Skipping image ${key}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return urls;
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

/**
 * Build the streaming request body.
 *
 * Tool and reasoning fields are omitted entirely when absent, matching the
 * provider's preference for absent keys over empty values.
 */
export function toResponsesRequest(
  input: ResponsesRequestInput,
  imageUrls: ReadonlyMap<string, string> = new Map(),
): ResponsesRequest {
  const tools = (input.tools ?? []).map(toResponsesTool);
  const instructions = systemInstructions(input.messages);
  return {
    model: input.model,
    input: toResponsesInput(input.messages, imageUrls),
    ...(instructions.length > 0 ? { instructions } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(input.reasoningEffort !== undefined
      ? { reasoning: { effort: input.reasoningEffort } }
      : {}),
    store: false,
    stream: true,
  };
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
  translate(event: ResponseStreamEvent): ModelFrame[] {
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
  stream: AsyncIterable<ResponseStreamEvent>,
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

/** Default bound on one model request's wait for response headers. */
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/** Read the model-request timeout, falling back to the default. */
function requestTimeoutMs(): number {
  const raw = process.env.OPENAI_REQUEST_TIMEOUT_MS?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

/** Read the configured reasoning effort, if any. */
function reasoningEffort(): ResponsesReasoningEffort | undefined {
  const raw = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  return raw === "low" || raw === "medium" || raw === "high" || raw === "xhigh"
    ? raw
    : undefined;
}

/** OpenAI Responses implementation of {@link ModelDriver}. */
export const openAIResponsesDriver: ModelDriver = {
  async *stream(input: ModelStreamInput): AsyncGenerator<ModelFrame> {
    const client = getOpenAIClient();
    if (!client) {
      throw new Error(
        "OpenAI API key is missing or not configured. Please add OPENAI_API_KEY to your environment.",
      );
    }

    const imageUrls = await imageUrlsFor(input.messages);
    const request = toResponsesRequest(
      {
        model: getOpenAIModel(),
        messages: input.messages,
        ...(input.tools !== undefined ? { tools: input.tools } : {}),
        ...(reasoningEffort() !== undefined
          ? { reasoningEffort: reasoningEffort()! }
          : {}),
      },
      imageUrls,
    );

    // A provider that accepts the request and never answers would hold the
    // turn open for the SDK's ten-minute default; bound the wait for headers.
    const stream = await client.responses.create(
      request as unknown as ResponseCreateParamsStreaming,
      {
        signal: input.signal,
        timeout: requestTimeoutMs(),
        maxRetries: 1,
      },
    );

    // `stream: true` on the request selects the streaming overload.
    yield* streamResponsesFrames(stream);
  },
};
