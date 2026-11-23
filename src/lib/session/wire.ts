/**
 * Server-side projection of durable session events onto the browser wire.
 *
 * The log is the write model and stays complete: tool arguments, tool output,
 * cron prompts and provider metadata are needed to replay a turn. The browser
 * only needs the display view, so every event that leaves the server passes
 * through {@link projectEventForClient} first. Nothing internal is sent and
 * then hidden in the UI.
 *
 * @module @/lib/session/wire
 */

import type { SessionEvent } from "@/lib/core/session/events";
import {
  isPromptDisplay,
  promptDisplayText,
  type ContentBlock,
  type UserMessage,
} from "@/lib/llm/llm/message";
import { toolLabel } from "@/components/tool.labels";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The content the transcript may show for one user-role message.
 *
 * Human input and block answers keep their content; a detail-bar action shows
 * its compact display; cron, system, tool-result and compaction context is
 * model-only and ships empty.
 */
function clientUserContent(message: UserMessage): ContentBlock[] {
  const source = message.source;
  const kind = source?.kind;

  if (kind === "detail-bar") {
    return isPromptDisplay(source?.display)
      ? [{ type: "text", text: promptDisplayText(source.display) }]
      : [];
  }
  if (
    kind === undefined ||
    kind === "user" ||
    kind === "ui-block" ||
    kind === "ui-action"
  ) {
    return message.content;
  }
  return [];
}

/**
 * Project one durable event onto exactly what the browser may see.
 *
 * Returns `null` when the event is internal bookkeeping with no display
 * equivalent (request headers, provider route metadata, inbox mutations).
 */
export function projectEventForClient(
  event: SessionEvent,
): SessionEvent | null {
  switch (event.type) {
    case "user/message":
      return {
        ...event,
        data: { ...event.data, content: clientUserContent(event.data) },
      };

    case "assistant/message": {
      const { stream: _stream, ...data } = event.data;
      const message = event.data.message;
      const source = message.source as
        | { turnKind?: unknown; turn?: unknown }
        | undefined;
      const turnKind =
        typeof source?.turnKind === "string"
          ? source.turnKind
          : typeof source?.turn === "string"
            ? source.turn
            : undefined;

      return {
        ...event,
        data: {
          ...data,
          message: message.source
            ? {
                ...message,
                source: {
                  kind: "model",
                  ...(turnKind !== undefined ? { turnKind } : {}),
                },
              }
            : message,
        },
      };
    }

    case "system/message":
      return { ...event, data: { ...event.data, content: "" } };

    case "tool/call":
      return {
        ...event,
        data: {
          ...event.data,
          arguments: "{}",
          label: toolLabel(
            event.data.name,
            parseArguments(event.data.arguments),
            String(event.data.callId),
          ),
        },
      };

    case "tool/result":
      return {
        ...event,
        data: {
          ...event.data,
          message: { ...event.data.message, content: [] },
          error: event.data.error
            ? { name: event.data.error.name, code: event.data.error.code }
            : undefined,
          meta: undefined,
        },
      };

    case "assistant/attempt":
      return {
        ...event,
        data: { turn: event.data.turn, step: event.data.step },
      };

    case "turn/end": {
      const reason = event.data.reason;
      const safeReason =
        reason.kind === "error"
          ? ({ kind: "error", error: "Turn failed" } as const)
          : reason.kind === "aborted" && reason.reason !== undefined
            ? ({ kind: "aborted" } as const)
            : reason;
      return { ...event, data: { ...event.data, reason: safeReason } };
    }

    case "compaction/checkpoint":
      return { ...event, data: { ...event.data, summary: "" } };

    case "compaction/prune":
      return { ...event, data: { ...event.data, content: [] } };

    case "request/header":
    case "request/context":
    case "agent/inbox/spliced":
      return null;

    default:
      return event;
  }
}
