/**
 * Provider-neutral model driver contract.
 *
 * A driver translates canonical messages and tool schemas to one provider's
 * wire format and streams normalized frames back. The agent loop owns turns,
 * steps, and durable events; the driver owns only the request/response shape.
 *
 * @module @/lib/llm/llm/driver
 */

import type { ImageAttachmentRef } from "@/lib/attachments/core/types";

/** One function call requested by the model. */
export interface ModelToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** One canonical conversation message. */
export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /**
   * Images this message carries. The provider adapter reads the bytes; the
   * text above stays as the human-readable label for them.
   */
  images?: readonly ImageAttachmentRef[];
  toolCalls?: ModelToolCall[];
  toolCallId?: string;
}

/** One model-facing function schema. */
export interface ModelToolSchema {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Token accounting for one model call. */
export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** One normalized streaming frame. */
export type ModelFrame =
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | {
      type: "tool-call-delta";
      index: number;
      id?: string;
      name?: string;
      argumentsDelta?: string;
    }
  | { type: "usage"; usage: ModelUsage }
  | { type: "done"; finishReason: string | null };

export interface ModelStreamInput {
  messages: readonly ModelMessage[];
  tools?: readonly ModelToolSchema[];
  signal?: AbortSignal;
  /** Owning tenant, used by drivers that resolve request attachments. */
  tenantId?: string;
}

/** One provider wire implementation. */
export interface ModelDriver {
  stream(input: ModelStreamInput): AsyncIterable<ModelFrame>;
}
