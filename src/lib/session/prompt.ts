/**
 * Strict prompt wire contract shared by the session route and its callers.
 *
 * The request is the only way a caller may describe a user turn: identity,
 * delivery mode, and ordered content. Every content part is a `type` plus one
 * payload object; a submitted UI block sends only its id and values, never the
 * spec. There is deliberately no sibling `input`/`role`/`hidden` escape hatch,
 * so a typo at this boundary is a compile error instead of a silently ignored
 * field.
 *
 * @module @/lib/session/prompt
 */

import type {
  AdmittedAttachmentContentPart,
  ImageAttachmentRef,
  ImageMediaType,
  VideoAttachmentRef,
  VideoMediaType,
} from "@/lib/attachments/core/types";
import { SessionId } from "@/lib/core/session/types";
import type { UIBlockSpec } from "@/lib/generative.ui";
import { MessageId, SessionRequestId } from "@/lib/llm/llm/brand";
import type { ContentBlock, UserMessage } from "@/lib/llm/llm/message";

/** One browser-submitted piece of prompt content, before attachment admission. */
export type PromptContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: ImageMediaType; data: string; name?: string }
  | { type: "video"; mediaType: VideoMediaType; data: string; name?: string }
  | { type: "file"; receiptId: string }
  | {
      type: "ui-block";
      block: {
        id: string;
        values: Record<string, unknown>;
      };
    };

/** Why a turn started. Only `user` renders as a human bubble. */
export type PromptSource = "user" | "cron" | "system" | "detail-bar";

/** One prompt submission: the complete, strict description of a user turn. */
export interface SessionPromptRequest {
  /** Client-minted; persisted on the accepted user message and used to dedupe retries. */
  requestId: SessionRequestId;
  sessionId: SessionId;
  /** `queue` starts a turn after the current one; `steer` injects at the next step boundary. */
  mode: "queue" | "steer";
  /** At least one non-whitespace text part, or any non-text part. */
  content: readonly PromptContentPart[];
  /**
   * Who started the turn. `user` is a human bubble; `cron`, `system` and
   * `detail-bar` are model-visible context that must never render as one.
   * Absent means `user`.
   */
  source?: PromptSource;
}

/**
 * A block answer after admission: the spec came from the log, never the wire.
 *
 * Shaped like every other admitted part: a `type` tag plus one nested payload.
 */
export interface AdmittedUIBlockContentPart {
  type: "ui-block";
  block: {
    id: string;
    spec: UIBlockSpec;
    values: Record<string, unknown>;
  };
}

/**
 * One part of a user message in its durable form: plain text, an admitted
 * attachment, or an admitted block answer. The list keeps the order the caller
 * submitted, so prose and media interleave exactly as written.
 */
export type AdmittedPromptPart =
  | { type: "text"; text: string }
  | AdmittedAttachmentContentPart
  | AdmittedUIBlockContentPart;

/** Whether a request carries at least one non-whitespace text or non-text part. */
export function hasPromptContent(
  content: readonly PromptContentPart[],
): boolean {
  return content.some(
    (part) => part.type !== "text" || part.text.trim().length > 0,
  );
}

/** Whether a JSON value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a JSON value is one prompt content part. */
function isPromptContentPart(value: unknown): value is PromptContentPart {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "text":
      return typeof value.text === "string";
    case "image":
    case "video":
      return (
        typeof value.mediaType === "string" &&
        typeof value.data === "string" &&
        (value.name === undefined || typeof value.name === "string")
      );
    case "ui-block": {
      const block = value.block;
      return (
        isRecord(block) &&
        typeof block.id === "string" &&
        isRecord(block.values)
      );
    }
    case "file":
      return typeof value.receiptId === "string";
    default:
      return false;
  }
}

/**
 * Runtime admission for an untrusted JSON request body. The compile-time
 * contract alone cannot protect an HTTP boundary; the route must reject
 * anything this guard does not recognise before it reaches durable storage.
 */
export function isSessionPromptRequest(
  value: unknown,
): value is SessionPromptRequest {
  return (
    isRecord(value) &&
    typeof value.requestId === "string" &&
    typeof value.sessionId === "string" &&
    (value.source === undefined ||
      value.source === "user" ||
      value.source === "cron" ||
      value.source === "system" ||
      value.source === "detail-bar") &&
    (value.mode === "queue" || value.mode === "steer") &&
    Array.isArray(value.content) &&
    value.content.every(isPromptContentPart) &&
    // A block answer is the entire submission: at most one block, and nothing
    // beside it. One builder produces it, and a single "answered" fact follows.
    (value.content.length === 1 ||
      !value.content.some((part) => isRecord(part) && part.type === "ui-block"))
  );
}

/** Whether a value has the minimum shape of a renderable UI block spec. */
function isUIBlockSpec(value: Record<string, unknown>): value is UIBlockSpec {
  const elements = value.elements;
  return (
    typeof value.root === "string" &&
    typeof elements === "object" &&
    elements !== null &&
    !Array.isArray(elements)
  );
}

/**
 * Map one request onto the canonical durable user message.
 *
 * `admitted` holds one part per wire part, in the same order: plain text, an
 * admitted attachment, or a resolved block answer. Admission happened one step
 * earlier, so this is a straight 1:1 transform.
 */
export function contentToUserMessage(
  request: SessionPromptRequest,
  admitted: readonly AdmittedPromptPart[],
): UserMessage {
  const content: ContentBlock[] = [];
  let answeredBlockId: string | undefined;

  for (const part of admitted) {
    switch (part.type) {
      case "ui-block": {
        const { id, spec, values } = part.block;
        if (!isUIBlockSpec(spec)) {
          throw new Error(`ui-block "${id}" carries an invalid spec`);
        }
        content.push({
          type: "block",
          spec: { id, ...spec, submitted: true, values },
        });
        content.push({
          type: "text",
          text: JSON.stringify({ blockId: id, values }),
        });
        answeredBlockId ??= id;
        break;
      }
      case "text":
        content.push({ type: "text", text: part.text });
        break;
      case "image":
        content.push(imageBlock(part.attachment));
        break;
      case "video":
        content.push(videoBlock(part.attachment));
        break;
      case "file":
        content.push({
          type: "file",
          ref: part.attachment,
          filename: part.attachment.name,
        });
        break;
    }
  }

  if (admitted.length !== request.content.length) {
    throw new Error("admitted content does not match the prompt parts");
  }

  return {
    id: MessageId(`request:${request.requestId}`),
    role: "user",
    content,
    source: {
      kind: request.source ?? "user",
      rpcId: request.requestId,
      ...(answeredBlockId === undefined ? {} : { blockId: answeredBlockId }),
    },
  };
}

function imageBlock(ref: ImageAttachmentRef): ContentBlock {
  return {
    type: "image",
    ref,
    mimeType: ref.mediaType,
    width: ref.width,
    height: ref.height,
    ...(ref.name !== undefined ? { alt: ref.name } : {}),
  };
}

function videoBlock(ref: VideoAttachmentRef): ContentBlock {
  return {
    type: "video",
    ref,
    mimeType: ref.mediaType,
    ...(ref.width !== undefined ? { width: ref.width } : {}),
    ...(ref.height !== undefined ? { height: ref.height } : {}),
    ...(ref.name !== undefined ? { alt: ref.name } : {}),
  };
}

// --- Client-side builders --------------------------------------------------

/** Inputs common to the prompt builders. */
export interface PromptRequestOptions {
  /** Client-minted idempotency key; a random id is minted when absent. */
  requestId?: string | SessionRequestId;
  /** `queue` (default) or `steer`. */
  mode?: "queue" | "steer";
  /** Who started the turn; non-`user` turns never render as a bubble. */
  source?: PromptSource;
}

/** Build one strict prompt request from already-shaped content parts. */
export function createSessionPromptRequest(
  sessionId: string | SessionId,
  content: readonly PromptContentPart[],
  options: PromptRequestOptions = {},
): SessionPromptRequest {
  return {
    requestId: SessionRequestId(options.requestId ?? crypto.randomUUID()),
    sessionId: SessionId(sessionId),
    mode: options.mode ?? "queue",
    content,
    ...(options.source !== undefined ? { source: options.source } : {}),
  };
}

/** Build a plain-text prompt request. */
export function createTextPromptRequest(
  sessionId: string | SessionId,
  text: string,
  options: PromptRequestOptions = {},
): SessionPromptRequest {
  return createSessionPromptRequest(
    sessionId,
    [{ type: "text", text }],
    options,
  );
}

/** Build a UI-block submission prompt request. */
export function createUiActionPromptRequest(
  sessionId: string | SessionId,
  answer: {
    blockId: string;
    values: Record<string, unknown>;
  },
  options: PromptRequestOptions = {},
): SessionPromptRequest {
  return createSessionPromptRequest(
    sessionId,
    [
      {
        type: "ui-block",
        block: { id: answer.blockId, values: answer.values },
      },
    ],
    options,
  );
}

/** Build a prompt request that references files the upload endpoint committed. */
export function createFilePromptRequest(
  sessionId: string | SessionId,
  receiptIds: readonly string[],
  options: PromptRequestOptions = {},
): SessionPromptRequest {
  return createSessionPromptRequest(
    sessionId,
    receiptIds.map((receiptId) => ({ type: "file" as const, receiptId })),
    options,
  );
}
