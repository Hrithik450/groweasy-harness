import type { ToolCallId } from "@/lib/core/session/brand";
import type { SessionEvent } from "@/lib/core/session/events";

export interface ToolTimelineItem {
  callId: ToolCallId | string;
  name: string;
  arguments: string;
  args: Record<string, unknown>;
  success?: boolean;
  data?: unknown;
  error?: string;
  meta?: unknown;
  calledAt: string;
  completedAt?: string;
}

function parseJsonArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Pure derivation function: matches tool calls with tool results to render
 * the real-time activity feed in the Right Detail Bar.
 */
export function deriveToolTimeline(
  events: readonly SessionEvent[],
): ToolTimelineItem[] {
  const map = new Map<string, ToolTimelineItem>();

  for (const event of events) {
    const createdAt = new Date(event.time).toISOString();

    if (event.type === "tool/call") {
      const callId = String(event.data.callId);
      map.set(callId, {
        callId: event.data.callId,
        name: event.data.name,
        arguments: event.data.arguments,
        args: parseJsonArguments(event.data.arguments),
        calledAt: createdAt,
      });
    } else if (event.type === "tool/result") {
      const callId = String(event.data.message.toolCallId);
      const isError = Boolean(event.data.message.isError);
      const errorMessage =
        event.data.error?.reason ||
        event.data.error?.name ||
        (isError ? "Tool execution failed" : undefined);

      const existing = map.get(callId);
      if (existing) {
        existing.success = !isError;
        existing.data = event.data.message.content;
        existing.error = errorMessage;
        existing.meta = event.data.meta;
        existing.completedAt = createdAt;
      } else {
        map.set(callId, {
          callId: event.data.message.toolCallId,
          name: "unknown_tool",
          arguments: "{}",
          args: {},
          success: !isError,
          data: event.data.message.content,
          error: errorMessage,
          meta: event.data.meta,
          calledAt: createdAt,
          completedAt: createdAt,
        });
      }
    }
  }

  return Array.from(map.values());
}
