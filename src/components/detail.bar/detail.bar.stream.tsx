"use client";

/**
 * Detail-bar updates riding the shared session stream.
 *
 * Both `detail-bar/items` and `detail-bar/item` merge by id: a level only
 * grows, so a short page event can never drop cards the client already loaded.
 *
 * @module @/components/detail.bar/detail.bar.stream
 */

import { useSessionStream } from "@/hooks/use.stream";
import { SESSION_DETAIL_BAR_EVENT } from "@/lib/session/journal";
import { isDetailBarField } from "@/lib/detail.bar/fields";
import { parseJson } from "@/lib/utils/journal";
import { useDetailBarStore } from "@/store/detail.bar.store";

export function DetailBarStream({ sessionId }: { sessionId: string }): null {
  useSessionStream(
    sessionId,
    (message) => {
      if (message.event !== SESSION_DETAIL_BAR_EVENT) return;

      const payload = parseJson(message.data) as {
        type?: string;
        field?: string;
        parentId?: string | null;
        items?: unknown;
      } | null;
      if (!payload || !isDetailBarField(payload.field)) return;
      if (!Array.isArray(payload.items)) return;

      if (payload.type === "item") {
        for (const item of payload.items) {
          useDetailBarStore
            .getState()
            .setItem(payload.field, payload.parentId ?? null, item);
        }
        return;
      }

      useDetailBarStore
        .getState()
        .mergePage(payload.field, payload.parentId ?? null, payload.items);
    },
    () => {},
  );

  return null;
}
