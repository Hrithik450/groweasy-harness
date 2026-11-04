/**
 * Framework-free agent event vocabulary: the append-only envelope, the wire
 * event union, and the message-content shapes those events carry.
 *
 * `session/update` describes a snapshot of the host's session row, which this
 * package cannot name. The union is therefore generic over that snapshot and
 * the application binds its own `Session` in `src/lib/core/agent/events.ts`;
 * no database module is imported here.
 *
 * @module @openai-harness/agent
 */

import type { SessionMessageRole, TurnEndReason } from "@openai-harness/session";

/** Model-visible content carried by one `session/message` event. */
export type MessageContent =
  | { kind: "text"; content: string }
  | { kind: "block"; content: unknown }
  | { kind: "attachment"; content: unknown };

/**
 * One append-only transport event with an optional durable position.
 *
 * @typeParam T - the event discriminator.
 * @typeParam D - the event payload.
 */
export interface EventEnvelope<T extends string, D> {
  type: T;
  seq?: number;
  data: D;
}

/**
 * Every event an agent execution can publish to its caller.
 *
 * @typeParam TSessionUpdate - the host's session snapshot carried by
 *   `session/update`; defaults to an untyped record so the vocabulary is
 *   usable without a host binding.
 */
export type AgentEvent<
  TSessionUpdate = Record<string, unknown>,
> =
  | EventEnvelope<
      "session/message",
      MessageContent & {
        id: string;
        role: SessionMessageRole;
        turn?: number;
        step?: number;
      }
    >
  | EventEnvelope<
      "session/update",
      Partial<TSessionUpdate> & { detailBar?: unknown }
    >
  | EventEnvelope<"session/status", { message: string; tool?: string }>
  | EventEnvelope<"session/error", { error: string }>
  | EventEnvelope<"session/done", { success: boolean }>
  | EventEnvelope<
      "turn/start",
      {
        turn: number;
      }
    >
  | EventEnvelope<
      "turn/end",
      {
        turn: number;
        reason?: TurnEndReason;
      }
    >
  | EventEnvelope<
      "step/start",
      {
        turn: number;
        step: number;
      }
    >
  | EventEnvelope<
      "step/end",
      {
        turn: number;
        step: number;
      }
    >
  | EventEnvelope<
      "tool/call",
      {
        name: string;
        args?: Record<string, unknown>;
        arguments?: string;
        callId?: string;
        turn?: number;
        step?: number;
      }
    >
  | EventEnvelope<
      "tool/result",
      {
        name: string;
        success: boolean;
        callId?: string;
        result?: unknown;
        error?: string;
        meta?: unknown;
        turn?: number;
        step?: number;
      }
    >;

/** The `session/message` member of {@link AgentEvent}. */
export type SessionMessageEvent<
  TSessionUpdate = Record<string, unknown>,
> = Extract<AgentEvent<TSessionUpdate>, { type: "session/message" }>;
