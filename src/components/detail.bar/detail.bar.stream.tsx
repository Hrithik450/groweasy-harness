"use client";

/**
 * Detail-bar updates riding the shared session stream.
 *
 * Headless: one consumer per open session. Pages replace a field's rows; a
 * single write upserts one row, so nested depth does not change payload size.
 *
 * @module @/components/detail.bar/detail.bar.stream
 */

import { useSessionStream } from "@/hooks/use.stream";
import { SESSION_DETAIL_BAR_EVENT } from "@/lib/session/journal";
import { isBarField, type BarItem } from "@/lib/detail.bar/fields";
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
        rows?: unknown;
        row?: unknown;
      } | null;
      if (!payload || !isBarField(payload.field)) return;

      const store = useDetailBarStore.getState();
      const target = payload.sessionId ?? sessionId;

      if (payload.type === "page" && Array.isArray(payload.rows)) {
        // Merge: rows from older pages stay, the first page refreshes.
        store.applyRows(target, payload.field, payload.rows as BarItem[], {
          replace: false,
        });
        return;
      }

      if (
        payload.type === "row" &&
        payload.row !== null &&
        typeof payload.row === "object"
      ) {
        store.applyRow(target, payload.field, payload.row as BarItem);
      }
    },
    () => {},
  );

  return null;
}
