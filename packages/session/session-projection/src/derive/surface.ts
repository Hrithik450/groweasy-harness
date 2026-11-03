/**
 * Surface layer on top of the session event log: an ordered view of events
 * that produce conversation messages.
 *
 * Pure and client-safe: it reads wire event/message vocabulary from the
 * shared packages and never touches storage.
 *
 * @module @openai-harness/session-projection/derive/surface
 */

import type { SessionEvent, SessionMessageRole } from "@openai-harness/session";
import type {
  AssistantMessage,
  ContentBlock,
  SystemMessage,
  ToolResultMessage,
  UserMessage,
} from "@openai-harness/llm";
import { MessageId } from "@openai-harness/llm";
import { SessionId, type SessionSeq } from "@openai-harness/session";
import {
  isFileAttachmentRef,
  isImageAttachmentRef,
} from "@openai-harness/attachment";

/**
 * Presentation class of one surface item.
 *
 * - `message` — a human turn (or an assistant answer); rendered as a bubble.
 * - `trigger` — non-human input that starts a turn (cron, agent relay);
 *   rendered as the turn's input, not as a human bubble.
 * - `context` — harness-injected model context (skill catalog, skill
 *   invocation, compaction checkpoint, system tool traces). Kept in the
 *   projection for metadata/derivation, never rendered as a chat bubble.
 */
export type SurfaceKind = "message" | "context" | "trigger";

/**
 * Classify one `user/message` source. Absent or human sources are messages;
 * scheduled/agent-relayed inputs are turn triggers; every other durable
 * source kind (tool traces, compaction checkpoints, interactive submissions)
 * is model context and never renders as a bubble.
 */
export function classifyUserSource(
  source: { kind?: string } | undefined,
): SurfaceKind {
  const kind = source?.kind;
  if (kind === undefined || kind === "user") return "message";
  if (kind === "cron" || kind === "agent") return "trigger";
  return "context";
}

/**
 * Closed domain union of conversation messages persisted in the log.
 */
export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ToolResultMessage;

/**
 * Surface item pairing an immutable conversation message with its durable
 * envelope coordinates (sequence, turn, step, timestamps).
 */
export interface SurfaceItem {
  readonly id: MessageId;
  readonly sessionId: SessionId;
  readonly seq: SessionSeq;
  readonly turn?: number;
  readonly step?: number;
  readonly role: SessionMessageRole;
  readonly message: Message;
  readonly content: ContentBlock[];
  readonly hidden: boolean;
  /** Presentation class; `context` items never render as chat bubbles. */
  readonly kind: SurfaceKind;
  readonly createdAt: string;
}

/**
 * Pure projection: extracts the model-facing message from a single event.
 * Returns null for non-surface events (turn brackets, tool calls, telemetry).
 */
export function deriveEventMessage(event: SessionEvent): Message | null {
  switch (event.type) {
    case "user/message":
      return event.data;
    case "assistant/message":
      return event.data.message;
    case "system/message":
      return event.data;
    case "tool/result":
      return event.data.message;
    default:
      return null;
  }
}

/**
 * Pure derivation function: projects raw events into clean conversation items for the chat UI.
 *
 * Guaranteed 0ms in-memory execution, deterministic, zero side-effects.
 */
export function foldSurface(
  events: readonly SessionEvent[],
  options: { sessionId: SessionId | string },
): SurfaceItem[] {
  const items: SurfaceItem[] = [];
  const sessionId = SessionId(options.sessionId);

  for (const event of events) {
    const createdAt = new Date(event.time).toISOString();

    if (event.type === "user/message") {
      const kind = classifyUserSource(event.data.source);
      items.push({
        id: event.data.id,
        sessionId,
        seq: event.seq,
        role: "user",
        message: event.data,
        content: event.data.content,
        hidden: kind === "context",
        kind,
        createdAt,
      });
    } else if (event.type === "assistant/message") {
      items.push({
        id: event.data.message.id,
        sessionId,
        seq: event.seq,
        turn: event.data.turn,
        step: event.data.step,
        role: "assistant",
        message: event.data.message,
        content: event.data.message.content,
        hidden: false,
        kind: "message",
        createdAt,
      });
    } else if (event.type === "ui/block") {
      const id = MessageId(event.data.id);
      const content: ContentBlock[] = [
        { type: "block", spec: event.data.spec, id: event.data.id },
      ];
      const item: SurfaceItem = {
        id,
        sessionId,
        seq: event.seq,
        role: "assistant",
        message: { id, role: "assistant", content },
        content,
        hidden: false,
        kind: "message",
        createdAt,
      };
      // Append-only log, singular surface: a later event for the same block
      // replaces the item it updates.
      const index = items.findIndex((existing) => existing.id === id);
      if (index === -1) items.push(item);
      else items[index] = item;
    } else if (event.type === "system/message") {
      const content: ContentBlock[] =
        typeof event.data.content === "string"
          ? [{ type: "text" as const, text: event.data.content }]
          : event.data.content;

      items.push({
        id: MessageId(`system:${sessionId}:${event.seq}`),
        sessionId,
        seq: event.seq,
        role: "system",
        message: event.data,
        content,
        hidden: false,
        kind: "context",
        createdAt,
      });
    } else if (event.type === "deliverables/presented") {
      const content: ContentBlock[] = event.data.files.map((file) => {
        if (file.ref) {
          const ref = file.ref;
          if (file.mimeType?.startsWith("image/")) {
            if (!isImageAttachmentRef(ref)) {
              throw new Error(
                `Deliverable "${file.title || file.path || ref.attachmentId}" declares ${file.mimeType} but its attachment reference is not an image.`,
              );
            }
            return {
              type: "image",
              ref,
              alt: file.title || file.description,
              mimeType: file.mimeType,
            };
          }
          if (!isFileAttachmentRef(ref)) {
            throw new Error(
              `Deliverable "${file.title || file.path || ref.attachmentId}" is not an image but its attachment reference is not a file.`,
            );
          }
          return {
            type: "file",
            ref,
            filename: file.title || file.path,
            mimeType: file.mimeType,
          };
        }
        return {
          type: "text",
          text: `[Deliverable: ${file.title || file.path || "Artifact"}]${
            file.description ? `\n${file.description}` : ""
          }`,
        };
      });

      const deliverableId = MessageId(
        `deliverable:${sessionId}:${event.seq}`,
      );
      const syntheticAssistantMessage: AssistantMessage = {
        id: deliverableId,
        role: "assistant",
        content,
      };

      items.push({
        id: deliverableId,
        sessionId,
        seq: event.seq,
        turn: event.data.turn,
        role: "assistant",
        message: syntheticAssistantMessage,
        content,
        hidden: false,
        kind: "message",
        createdAt,
      });
    }
  }

  return items;
}
