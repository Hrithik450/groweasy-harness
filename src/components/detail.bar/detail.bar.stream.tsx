"use client";

/**
 * Detail-bar updates riding the shared session stream.
 *
 * The server sends a whole tab whenever it changes: one array, nested as the
 * UI renders it.
 *
 * @module @/components/detail.bar/detail.bar.stream
 */

import { useSessionStream } from "@/hooks/use.stream";
import { SESSION_DETAIL_BAR_EVENT } from "@/lib/session/journal";
import { isBarField } from "@/lib/detail.bar/fields";
import { parseJson } from "@/lib/utils/journal";
import { useDetailBarStore } from "@/store/detail.bar.store";

export function DetailBarStream({ sessionId }: { sessionId: string }): null {
  useSessionStream(
    sessionId,
    (message) => {
      if (message.event !== SESSION_DETAIL_BAR_EVENT) return;

      const payload = parseJson(message.data) as {
        type?: string;
        sessionId?: string;
        field?: string;
        items?: unknown;
      } | null;
      if (!payload || !isBarField(payload.field)) return;
      if (payload.type !== "field" || !Array.isArray(payload.items)) return;

      useDetailBarStore
        .getState()
        .setField(
          payload.sessionId ?? sessionId,
          payload.field,
          payload.items,
        );
    },
    () => {},
  );

  return null;
}
