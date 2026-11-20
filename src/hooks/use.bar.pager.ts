"use client";

/**
 * One detail-bar level: live items, first fetch for children, keyset paging.
 *
 * Roots are seeded by `DetailBar`; a child level fetches once when opened
 * because the session snapshot never carries children. Stream events merge
 * into the same level, and paging asks for rows older than the last loaded
 * card's `seq|id`, so inserts never shift or duplicate a page.
 *
 * @module @/hooks/use.bar.pager
 */

import { useCallback, useRef, useState } from "react";
import {
  readCursor,
  readPage,
  useDetailBarStore,
} from "@/store/detail.bar.store";
import { tabRetention, type DetailBarField } from "@/lib/detail.bar/fields";
import type { BarCard } from "@/lib/detail.bar/types";

export interface BarPager<T> {
  items: BarCard<T>[];
  hydrated: boolean;
  hasMore: boolean;
  isLoading: boolean;
  loadMore: () => void;
}

function tailCursor(item: unknown): string | null {
  const card = item as { id?: unknown; seq?: unknown } | undefined;
  return typeof card?.id === "string" && typeof card?.seq === "number"
    ? `${card.seq}|${card.id}`
    : null;
}

interface BarPageResponse {
  parentId?: string | null;
  items?: unknown[];
  nextCursor?: string | null;
}

async function fetchBarPage(
  sessionId: string,
  query: URLSearchParams,
): Promise<BarPageResponse> {
  const response = await fetch(
    `/api/sessions/${sessionId}/detail.bar?${query.toString()}`,
  );
  if (!response.ok) throw new Error(`bar page ${response.status}`);
  return (await response.json()) as BarPageResponse;
}

export function useBarPager<T>(
  sessionId: string | undefined,
  field: DetailBarField,
  parentId: string | null = null,
): BarPager<T> {
  const stored = useDetailBarStore((state) =>
    readPage(state.pages, field, parentId),
  );
  const cursor = useDetailBarStore((state) =>
    readCursor(state.cursors, field, parentId),
  );
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);

  const items = (stored as BarCard<T>[] | undefined) ?? [];
  // No cursor yet: only a full seeded page can have older rows.
  const hasMore =
    cursor === undefined ? items.length >= tabRetention(field) : cursor !== null;

  const loadMore = useCallback(() => {
    if (!sessionId || loadingRef.current || !hasMore) return;

    const next = cursor ?? tailCursor(items[items.length - 1]);
    if (!next) return;

    loadingRef.current = true;
    setIsLoading(true);

    const query = new URLSearchParams({ field, cursor: next });
    if (parentId) query.set("parentId", parentId);

    fetchBarPage(sessionId, query)
      .then((page) => {
        useDetailBarStore
          .getState()
          .mergePage(
            field,
            page.parentId ?? parentId,
            page.items ?? [],
            page.nextCursor ?? null,
          );
      })
      .catch((err: unknown) => {
        console.error("[Bar] Could not load older cards:", err);
      })
      .finally(() => {
        loadingRef.current = false;
        setIsLoading(false);
      });
  }, [sessionId, field, parentId, cursor, hasMore, items]);

  return {
    items,
    hydrated: stored !== undefined,
    hasMore,
    isLoading,
    loadMore,
  };
}
