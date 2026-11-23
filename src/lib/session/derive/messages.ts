import type { SessionEvent } from "@/lib/core/session/events";
import { MessageId, SessionId } from "@/lib/core/session/brand";
import { assistantTurnSource } from "@/lib/core/agent/assistant.source";
import { classifyUserSource, isUserBubble } from "./source";
import {
  isPromptDisplay,
  promptDisplayText,
  type ContentBlock,
  type Message,
  type UserMessage,
} from "@/lib/llm/llm/message";
import {
  isFileAttachmentRef,
  isImageAttachmentRef,
} from "@/lib/attachments/core/types";

/**
 * One message plus the log position it occupies.
 *
 * The value itself is the durable message (id, role, content, source); `seq`,
 * `turn`, `step`, and `time` belong to the event that carried it, exactly as
 * the reference keeps envelope and payload apart.
 */
export interface SessionMessage {
  message: Message;
  seq: number;
  turn?: number;
  step?: number;
  /** Event time, ISO 8601. */
  time: string;
}

/** Replace a detail-bar prompt with the compact line the transcript shows. */
function displayUserMessage(message: UserMessage): UserMessage {
  const source = message.source;
  if (source?.kind !== "detail-bar" || !isPromptDisplay(source.display)) {
    return message;
  }

  return {
    ...message,
    content: [{ type: "text", text: promptDisplayText(source.display) }],
  };
}

export function deriveMessages(
  events: readonly SessionEvent[],
  options?: { sessionId?: SessionId | string },
): SessionMessage[] {
  const messages: SessionMessage[] = [];

  for (const event of events) {
    const createdAt = new Date(event.time).toISOString();

    if (event.type === "user/message") {
      const message = event.data;
      if (!isUserBubble(message.source, message.content)) continue;
      messages.push({
        message: displayUserMessage(message),
        seq: event.seq,
        time: createdAt,
      });
    } else if (event.type === "assistant/message") {
      const message = event.data.message;
      const replyOrigin = assistantTurnSource(message.source);
      // Cron/agent/system turns are automation, not transcript. A detail-bar
      // reply stays visible: its action shows a compact bubble.
      if (
        replyOrigin !== undefined &&
        replyOrigin !== "detail-bar" &&
        classifyUserSource({ kind: replyOrigin }) !== "message"
      ) {
        continue;
      }

      messages.push({
        message,
        seq: event.seq,
        turn: event.data.turn,
        step: event.data.step,
        time: createdAt,
      });
    } else if (event.type === "system/message") {
      const content =
        typeof event.data.content === "string"
          ? [{ type: "text" as const, text: event.data.content }]
          : event.data.content;

      messages.push({
        message: { role: "system", content },
        seq: event.seq,
        time: createdAt,
      });
    } else if (event.type === "deliverables/presented") {
      const blocks: ContentBlock[] = event.data.files.map((file) => {
        const fallback = `[Deliverable: ${
          file.title || file.path || "Artifact"
        }]${file.description ? `\n${file.description}` : ""}`;

        if (file.ref) {
          if (
            file.mimeType?.startsWith("image/") &&
            isImageAttachmentRef(file.ref)
          ) {
            return {
              type: "image",
              ref: file.ref,
              alt: file.title || file.description,
              mimeType: file.mimeType,
            };
          }
          if (isFileAttachmentRef(file.ref)) {
            return {
              type: "file",
              ref: file.ref,
              filename: file.title || file.path,
              mimeType: file.mimeType,
            };
          }
        }
        return { type: "text", text: fallback };
      });

      messages.push({
        message: {
          id: MessageId(`deliverable:${String(event.seq)}`),
          role: "assistant",
          content: blocks,
        },
        seq: event.seq,
        turn: event.data.turn,
        time: createdAt,
      });
    }
  }

  return messages;
}
