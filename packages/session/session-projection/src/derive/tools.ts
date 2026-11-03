/**
 * Pure tool-call/result pairing for the activity timeline.
 *
 * @module @openai-harness/session-projection/derive/tools
 */

import type { ToolCallId } from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";

/** One resolved tool call in the session activity feed. */
export interface ToolTimelineItem {
  turn?: number;
  step?: number;
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
    const at = new Date(event.time).toISOString();

    if (event.type === "tool/call") {
      const callId = String(event.data.callId);
      map.set(callId, {
        turn: event.data.turn,
        step: event.data.step,
        callId: event.data.callId,
        name: event.data.name,
        arguments: event.data.arguments,
        args: parseJsonArguments(event.data.arguments),
        calledAt: at,
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
        if (event.data.turn !== undefined) existing.turn = event.data.turn;
        if (event.data.step !== undefined) existing.step = event.data.step;
        existing.success = !isError;
        existing.data = event.data.message.content;
        existing.error = errorMessage;
        existing.meta = event.data.meta;
        existing.completedAt = at;
      } else {
        map.set(callId, {
          turn: event.data.turn,
          step: event.data.step,
          callId: event.data.message.toolCallId,
          name: "unknown_tool",
          arguments: "{}",
          args: {},
          success: !isError,
          data: event.data.message.content,
          error: errorMessage,
          meta: event.data.meta,
          calledAt: at,
          completedAt: at,
        });
      }
    }
  }

  return Array.from(map.values());
}
