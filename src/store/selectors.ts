"use client";

import { useMemo } from "react";
import type { ChatNode } from "@/components/chat/nodes";
import type { SessionEvent } from "@/lib/core/session/events";
import { useChatStore, type SessionPagination } from "./chat.store";
import { deriveNodes } from "./derive.nodes";

const NO_EVENTS: readonly SessionEvent[] = [];

/** The durable event window for one session. */
export function useEvents(sessionId: string): readonly SessionEvent[] {
  return useChatStore((state) => state.events[sessionId] ?? NO_EVENTS);
}

/** Chat nodes for one session: events folded, then live text layered on top. */
export function useChatNodes(sessionId: string): ChatNode[] {
  const events = useEvents(sessionId);
  const live = useChatStore((state) => state.liveStreams[sessionId]);
  return useMemo(
    () => deriveNodes(sessionId, events, live),
    [events, live, sessionId],
  );
}

/** Paging state for one session, if a page has been requested yet. */
export function usePagination(
  sessionId: string,
): SessionPagination | undefined {
  return useChatStore((state) => state.pagination[sessionId]);
}

/**
 * Streaming while the last turn has not closed, or while a just-sent prompt
 * has not been acknowledged yet (so "thinking" appears before the first event).
 *
 * Turn boundaries come from the raw log, not derived nodes: a block-answer
 * `user/message` derives no node, so a node-based check would read the
 * previous settled turn while the model is already working on the new one.
 */
export function useIsStreaming(sessionId: string): boolean {
  const events = useEvents(sessionId);
  const pending = useChatStore(
    (state) => (state.pending[sessionId]?.length ?? 0) > 0,
  );

  return useMemo(() => {
    if (pending) return true;

    let lastStart = 0;
    let lastEnd = 0;
    for (const event of events) {
      if (event.type === "turn/start") {
        lastStart = Math.max(lastStart, event.data.turn);
      } else if (event.type === "turn/end") {
        lastEnd = Math.max(lastEnd, event.data.turn);
      }
    }
    return lastStart > lastEnd;
  }, [events, pending]);
}
