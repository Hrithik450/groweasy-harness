"use client";

/**
 * Older-page loading for one detail-bar list.
 *
 * Loaded pages are upserted into the detail-bar store, so a row event can
 * refresh a card that came from an older page. The returned `items` is the
 * store's assembled list (falling back to the server-rendered seed).
 *
 * @module @/hooks/use.bar.pager
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDetailBarStore } from "@/store/detail.bar.store";
import { barOwner, BAR_PAGE_SIZE, type BarField } from "@/lib/detail.bar/fields";
import { flattenBarItems } from "@/lib/detail.bar/rows";

interface Sequenced {
  id?: string;
  updatedAt?: string;
}

export interface BarPager<T extends Sequenced> {
  items: T[];
  hasMore: boolean;
  isLoading: boolean;
  loadMore: () => void;
}

/** Cursor of the last card in a page: `updatedAt|id`, newest first. */
function lastCursor<T extends Sequenced>(items: readonly T[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item?.id || !item.updatedAt) continue;
    return `${item.updatedAt}|${item.id}`;
  }
  return null;
}

export function useBarPager<T extends Sequenced>(
  sessionId: string,
  field: BarField,
  seed: readonly T[],
  total?: number,
  /** When set, pages the children of this row instead of the field's roots. */
  parentId?: string,
  /** Sub-tab kind path for those children, e.g. campaigns.ads. */
  kind?: string,
): BarPager<T> {
  const [cursor, setCursor] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const startCursor = useMemo(() => lastCursor(seed), [seed]);

  // The store starts empty, so hydrate it once from the server seed; otherwise
  // the first row event would assemble against one row and lose its parent.
  // The seed identity changes with every store update, hence the one-shot ref.
  const hydrated = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || seed.length === 0) return;
    const key = `${sessionId}|${field}`;
    if (hydrated.current === key) return;
    hydrated.current = key;
    useDetailBarStore.getState().applyRows(
      sessionId,
      field,
      flattenBarItems(seed as readonly unknown[]),
      { replace: false },
    );
  }, [field, seed, sessionId]);

  const loadMore = useCallback(() => {
    if (isLoading || exhausted) return;
    const from = cursor ?? startCursor;
    setIsLoading(true);
    const query = new URLSearchParams({ field, limit: "20" });
    if (from !== null) query.set("cursor", from);
    if (parentId) query.set("parentId", parentId);
    if (kind) query.set("kind", kind);

    void fetch(`/api/sessions/${sessionId}/bar?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`bar page ${response.status}`);
        return (await response.json()) as {
          items: unknown[];
          nextCursor: string | null;
          hasMore: boolean;
        };
      })
      .then((page) => {
        // Older pages join the same normalized store as live events.
        useDetailBarStore.getState().applyRows(
          sessionId,
          field,
          flattenBarItems(page.items),
          { replace: false },
        );
        setCursor(page.nextCursor);
        if (!page.hasMore) setExhausted(true);
      })
      .catch((error: unknown) => {
        console.warn("[Bar] Could not load older items:", error);
        setExhausted(true);
      })
      .finally(() => setIsLoading(false));
  }, [
    cursor,
    exhausted,
    field,
    isLoading,
    kind,
    parentId,
    sessionId,
    startCursor,
  ]);

  const stored = useDetailBarStore((state) => {
    const owner = barOwner(field);
    const group = (
      state.states[sessionId] as Record<string, unknown> | undefined
    )?.[owner];
    return (group as Record<string, unknown> | undefined)?.[field];
  });

  const items = (stored as T[] | undefined) ?? (seed as T[]);

  const hasMore =
    !exhausted &&
    (total !== undefined
      ? total > items.length
      : seed.length >= BAR_PAGE_SIZE);

  return { items, hasMore, isLoading, loadMore };
}
