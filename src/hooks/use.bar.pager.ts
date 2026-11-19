"use client";

/**
 * One detail-bar tab for a component.
 *
 * The store holds the tab array pushed by the server; before the first push,
 * the server-rendered seed is used. No cursors: a tab is one document.
 *
 * @module @/hooks/use.bar.pager
 */

import { useEffect, useRef } from "react";
import { useDetailBarStore, readField } from "@/store/detail.bar.store";
import type { BarField } from "@/lib/detail.bar/fields";

export interface BarPager<T> {
  items: T[];
  hasMore: boolean;
  isLoading: boolean;
  loadMore: () => void;
}

export function useBarPager<T>(
  sessionId: string,
  field: BarField,
  seed: readonly T[],
): BarPager<T> {
  // Server-rendered seed lands in the store once, so later field events win.
  const hydrated = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || seed.length === 0) return;
    const key = `${sessionId}|${field}`;
    if (hydrated.current === key) return;
    hydrated.current = key;
    const current = readField(
      useDetailBarStore.getState().states,
      sessionId,
      field,
    );
    if (!current) {
      useDetailBarStore
        .getState()
        .setField(sessionId, field, [...seed]);
    }
  }, [field, seed, sessionId]);

  const stored = useDetailBarStore((state) =>
    readField(state.states, sessionId, field),
  );

  return {
    items: (stored as T[] | undefined) ?? (seed as T[]),
    hasMore: false,
    isLoading: false,
    loadMore: () => {},
  };
}
