/**
 * Shared RPC contract for the standalone agent gateway.
 *
 * The method surface mirrors the DeepSeek harness Session service
 * (`session.list`, `session.inspect`, `session.prompt`, `session.cancel`,
 * `session.page`, `session.follow`). `session.block.submit` is this harness's
 * only extension: DeepSeek has no interactive UI blocks.
 *
 * This module is imported by both the Node gateway and the browser client, so
 * it must stay framework-free: no Next.js imports and no server-only runtime
 * dependencies. Types from the harness are imported with `import type`, which
 * is erased before the module reaches the browser.
 *
 * The legacy single-WebSocket envelopes (`call`/`subscribe`/`result`/`frame`)
 * are deleted: unary methods travel as Connection HTTP envelopes and streams
 * travel over the Remote stream mux.
 *
 * @module @openai-harness/sdk-protocol
 */

import { z } from "zod";
import type { SessionView } from "@openai-harness/session";
import type { SessionEvent } from "@openai-harness/session";
import type { UIBlockSpec } from "@openai-harness/generative-ui";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/* =========================================================================
 * Wire values
 * ========================================================================= */

/** One raw session-log event on the wire. */
export type SessionWireEvent = SessionEvent;

/** One raw event entry: the record shape history pages and follow frames use. */
export interface SessionEventEntry {
  readonly type: "event";
  readonly event: SessionWireEvent;
}

/** Client-minted identity used to reconcile optimistic and durable messages. */
export type SessionRequestId = string;

/** Browser-submitted prompt content. Non-text parts are not admitted yet. */
export type PromptContentPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "image";
      readonly mediaType: string;
      readonly data: string;
      readonly name?: string;
    }
  | {
      readonly type: "video";
      readonly mediaType: string;
      readonly data: string;
      readonly name?: string;
    }
  | { readonly type: "file"; readonly receiptId: string };

/** Delivery mode of one prompt. */
export type SessionPromptMode = "queue" | "steer";

/** One prompt admitted into the Session agent inbox. */
export interface SessionPromptRequest {
  /** Client-minted identity persisted on the exact accepted user message. */
  readonly requestId: SessionRequestId;
  readonly sessionId: string;
  readonly mode: SessionPromptMode;
  /** At least one non-whitespace text part. */
  readonly content: readonly PromptContentPart[];
  readonly clientTimeZone?: string;
  /**
   * Harness extension (no DeepSeek counterpart): the prompt was synthesized by
   * an interactive UI surface rather than typed. It stays in the model context
   * and out of the chat transcript.
   */
  readonly origin?: "ui-action";
}

/** Receipt after one prompt enters the target agent inbox. */
export interface SessionPromptValue {
  readonly accepted: true;
}

/** One cancellation request. */
export interface SessionCancelRequest {
  readonly sessionId: string;
}

/** Cancellation result. */
export interface SessionCancelValue {
  readonly cancelled: boolean;
}

/** One message-aligned backwards-history request. */
export interface SessionPageRequest {
  readonly sessionId: string;
  /** Inclusive log cut obtained from the corresponding follow opening frame. */
  readonly throughSeq?: number;
  readonly beforeSeq?: number;
  readonly maxMessages?: number;
  /** Stop at a turn start after both minima. */
  readonly turnWindow?: {
    /** Minimum messages in the page. */
    readonly minMessages: number;
    /** Minimum turn starts crossed, including the partial turn at `beforeSeq`. */
    readonly minTurns: number;
  };
}

/** One backwards-history page. */
export interface SessionPage {
  readonly records: readonly SessionEventEntry[];
  readonly hasMore: boolean;
}

/** One whole projected state plus the log cut it reflects. */
export interface SessionProjectionValue {
  /** Projection key, always `"detailBar"` today. */
  readonly key: string;
  /** Inclusive watermark of the last folded event; `-1` before any event. */
  readonly asOfSeq: number;
  /** Schema version of the projected state. */
  readonly stateVersion: number;
  /** The projection-owned whole value. */
  readonly state: unknown;
}

/** One live follow request. */
export interface SessionFollowRequest {
  readonly sessionId: string;
  readonly afterSeq?: number;
  readonly maxMessages?: number;
  readonly turnWindow?: SessionPageRequest["turnWindow"];
}

/** Compact in-flight assistant text at the opening revision. */
export interface SessionAssistantStreamBaseline {
  readonly attemptId: string;
  readonly revision: number;
  readonly turn: number;
  readonly step: number;
  /** Uncommitted chunks, in index order. */
  readonly chunks: readonly { readonly delta: string }[];
}

/** One process-local assistant presentation frame. */
export type SessionAssistantStreamFrame =
  | {
      readonly type: "start";
      readonly attemptId: string;
      readonly revision: number;
      readonly turn: number;
      readonly step: number;
      /** Next durable seq when the attempt began. */
      readonly startedAfterSeq: number;
    }
  | {
      readonly type: "chunk";
      readonly attemptId: string;
      readonly revision: number;
      readonly index: number;
      readonly time: number;
      readonly chunk: { readonly delta: string };
    }
  | {
      readonly type: "end";
      readonly attemptId: string;
      readonly revision: number;
      readonly index: number;
      readonly outcome:
        | {
            readonly kind: "committed";
            readonly eventType: "assistant/message" | "assistant/attempt";
            readonly seq: number;
          }
        | { readonly kind: "abandoned" };
    };

/** Durable opening window followed by ordered events and assistant frames. */
export type SessionFollowFrame =
  | {
      readonly type: "snapshot";
      readonly cursor: number;
      readonly records: readonly SessionEventEntry[];
      readonly hasMore: boolean;
      readonly assistantStream?: SessionAssistantStreamBaseline;
    }
  | SessionEventEntry
  | {
      readonly type: "assistant-stream";
      readonly frame: SessionAssistantStreamFrame;
    };

/* =========================================================================
 * Request / result map
 * ========================================================================= */

export interface RpcRequestMap {
  "session.list": {
    params: void;
    result: SessionView[];
  };
  "session.inspect": {
    params: { sessionId: string };
    result: SessionView;
  };
  /** Create one session owned by the calling user. */
  "session.create": {
    params: { title: string };
    result: SessionView;
  };
  /** Read one projection over an owned session's committed log. */
  "session.projection": {
    params: { sessionId: string; key?: string };
    result: SessionProjectionValue;
  };
  /**
   * Replace the whole detail-bar projection in one append.
   *
   * The concrete state shape is validated by the controller, not the wire
   * schema; the parameter is `unknown` here so the projection owns its type.
   */
  "detailBar.update": {
    params: { sessionId: string; detailBar: unknown };
    result: SessionProjectionValue;
  };
  "session.prompt": {
    params: SessionPromptRequest;
    result: SessionPromptValue;
  };
  "session.page": {
    params: SessionPageRequest;
    result: SessionPage;
  };
  "session.cancel": {
    params: SessionCancelRequest;
    result: SessionCancelValue;
  };
  /**
   * Harness extension (no DeepSeek counterpart): commit the interaction state
   * of one rendered block and admit a hidden prompt carrying its values.
   */
  "session.block.submit": {
    params: {
      sessionId: string;
      /** The `ui/block` event id the interaction belongs to. */
      blockId: string;
      /** The block spec carrying the interaction state (`values`, `submitted`). */
      spec: UIBlockSpec;
    };
    result: SessionPromptValue;
  };
}

export type RpcMethod = keyof RpcRequestMap;

/**
 * Runtime list of every method. Kept in sync with {@link RpcRequestMap} by the
 * compile-time assertion below and the schema map.
 */
export const RPC_METHODS = [
  "session.list",
  "session.inspect",
  "session.create",
  "session.projection",
  "detailBar.update",
  "session.prompt",
  "session.page",
  "session.cancel",
  "session.block.submit",
] as const satisfies readonly RpcMethod[];

type MissingRpcMethod = Exclude<RpcMethod, (typeof RPC_METHODS)[number]>;
// Compile-time guard: every member of RpcRequestMap must appear in RPC_METHODS.
const _allRpcMethodsListed: MissingRpcMethod extends never ? true : never =
  true;
void _allRpcMethodsListed;

/* =========================================================================
 * Param schemas
 * ========================================================================= */

const promptContentPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("image"),
    mediaType: z.string().min(1),
    data: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("video"),
    mediaType: z.string().min(1),
    data: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({ type: z.literal("file"), receiptId: z.string().min(1) }),
]) satisfies z.ZodType<PromptContentPart>;

const turnWindowSchema = z.object({
  minMessages: z.number().int().nonnegative(),
  minTurns: z.number().int().nonnegative(),
});

export const rpcParamSchemas: {
  [M in RpcMethod]: z.ZodType<RpcRequestMap[M]["params"]>;
} = {
  "session.list": z.void(),
  "session.inspect": z.object({
    sessionId: z.string().min(1),
  }),
  "session.create": z.object({
    title: z.string().trim().min(1),
  }),
  "session.projection": z.object({
    sessionId: z.string().min(1),
    key: z.string().min(1).optional(),
  }),
  "detailBar.update": z.object({
    sessionId: z.string().min(1),
    detailBar: z.unknown(),
  }),
  "session.prompt": z.object({
    requestId: z.string().min(1),
    sessionId: z.string().min(1),
    mode: z.enum(["queue", "steer"]),
    content: z
      .array(promptContentPartSchema)
      .min(1)
      .refine(
        (parts) =>
          parts.some(
            (part) =>
              (part.type === "text" && part.text.trim().length > 0) ||
              part.type !== "text",
          ),
        "Prompt content requires a non-whitespace text part",
      ),
    clientTimeZone: z.string().optional(),
    origin: z.literal("ui-action").optional(),
  }),
  "session.page": z.object({
    sessionId: z.string().min(1),
    throughSeq: z.number().int().nonnegative().optional(),
    beforeSeq: z.number().int().nonnegative().optional(),
    maxMessages: z.number().int().positive().max(500).optional(),
    turnWindow: turnWindowSchema.optional(),
  }),
  "session.cancel": z.object({
    sessionId: z.string().min(1),
  }),
  "session.block.submit": z.object({
    sessionId: z.string().min(1),
    blockId: z.string().min(1),
    spec: z.custom<UIBlockSpec>((value) => isRecord(value)),
  }),
};

/* =========================================================================
 * Subscriptions
 * ========================================================================= */

export interface SessionFollowChannel {
  params: SessionFollowRequest;
  event: SessionFollowFrame;
}

export interface RpcSubscriptionMap {
  "session.follow": SessionFollowChannel;
}

export type RpcChannel = keyof RpcSubscriptionMap;

export const subscriptionParamsSchemas: {
  [C in RpcChannel]: z.ZodType<RpcSubscriptionMap[C]["params"]>;
} = {
  "session.follow": z.object({
    sessionId: z.string().min(1),
    afterSeq: z.number().int().nonnegative().optional(),
    maxMessages: z.number().int().positive().max(500).optional(),
    turnWindow: turnWindowSchema.optional(),
  }),
};

