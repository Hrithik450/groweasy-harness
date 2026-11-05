/**
 * Provider-neutral model driver contract.
 *
 * A driver translates canonical messages and tool schemas to one provider's
 * wire format and streams normalized frames back. The agent loop owns turns,
 * steps, and durable events; the driver owns only the request/response shape.
 *
 * @module @/lib/llm/driver
 */

import type { Message } from "./message";

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
  messages: readonly Message[];
  tools?: readonly ModelToolSchema[];
  signal?: AbortSignal;
  /** Owning tenant, used to resolve image attachments. */
  tenantId?: string;
}

/** One provider wire implementation. */
export interface ModelDriver {
  stream(input: ModelStreamInput): AsyncIterable<ModelFrame>;
}
