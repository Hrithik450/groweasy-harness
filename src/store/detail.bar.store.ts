"use client";

/**
 * Detail-bar fields pushed by the server.
 *
 * Each tab is one array, exactly as the backend stores it; there is no tree
 * to assemble. A field event replaces that tab's array.
 *
 * @module @/store/detail.bar.store
 */

import { create } from "zustand";
import type { DetailBarState } from "@/lib/detail.bar/state";
import { barOwner, type BarField } from "@/lib/detail.bar/fields";

interface DetailBarStore {
  /** Card arrays per session and tab, as the UI renders them. */
  states: Record<string, DetailBarState | undefined>;

  /** Replace one tab's cards. */
  setField: (sessionId: string, field: BarField, items: unknown[]) => void;
  /** Merge cards into one tab by id (rare; used by older callers). */
  applyRows: (sessionId: string, field: BarField, rows: unknown[]) => void;
  /** Upsert one card by id. */
  applyRow: (sessionId: string, field: BarField, row: unknown) => void;
}

function withField(
  state: DetailBarStore,
  sessionId: string,
  field: BarField,
  items: unknown[],
): Partial<DetailBarStore> {
  const owner = barOwner(field);
  const existing = (state.states[sessionId] ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const group = existing[owner] ?? {};
  return {
    states: {
      ...state.states,
      [sessionId]: { ...existing, [owner]: { ...group, [field]: items } },
    } as unknown as Record<string, DetailBarState | undefined>,
  };
}

/** One tab's array, or `undefined` before any event lands. */
export function readField(
  states: Record<string, DetailBarState | undefined>,
  sessionId: string,
  field: BarField,
): unknown[] | undefined {
  const owner = barOwner(field);
  const group = (states[sessionId] as Record<string, unknown> | undefined)?.[
    owner
  ] as Record<string, unknown> | undefined;
  return group?.[field] as unknown[] | undefined;
}

export const useDetailBarStore = create<DetailBarStore>((set) => ({
  states: {},

  setField: (sessionId, field, items) =>
    set((state) => ({
      ...withField(state, sessionId, field, items),
    })),

  applyRows: (sessionId, field, rows) =>
    set((state) => ({ ...withField(state, sessionId, field, rows) })),

  applyRow: (sessionId, field, row) =>
    set((state) => {
      const current = readField(state.states, sessionId, field) ?? [];
      const id = (row as { id?: string })?.id;
      if (!id) return state;
      const next = current.some((item) => (item as { id?: string })?.id === id)
        ? current.map((item) =>
            (item as { id?: string })?.id === id ? row : item,
          )
        : [...current, row];
      return { ...withField(state, sessionId, field, next) };
    }),
}));
