"use client";

/**
 * Detail-bar projections pushed by the server.
 *
 * Rows are stored normalized (`byId`), exactly like `bar_items`; the nested
 * card shape is assembled on read. One row event therefore costs one row,
 * whatever the tree depth.
 *
 * @module @/store/detail.bar.store
 */

import { create } from "zustand";
import type { DetailBarState } from "@/lib/detail.bar/state";
import { barOwner, type BarField, type BarItem } from "@/lib/detail.bar/fields";
import { assembleBarItems } from "@/lib/detail.bar/rows";

interface FieldRows {
  byId: Record<string, BarItem>;
}

interface DetailBarStore {
  /** Nested card shape read by the UI, derived from `rows`. */
  states: Record<string, DetailBarState | undefined>;
  /** Normalized rows per session and field. */
  rows: Record<string, Record<string, FieldRows | undefined>>;

  /** Replace (or merge) one field's rows; the card list is re-derived. */
  applyRows: (
    sessionId: string,
    field: BarField,
    rows: readonly BarItem[],
    options?: { replace?: boolean },
  ) => void;
  /** Upsert one row; the affected card is re-derived. */
  applyRow: (sessionId: string, field: BarField, row: BarItem) => void;
}

/** Write a field's derived card list into its bar group. */
function withField(
  state: DetailBarStore,
  sessionId: string,
  field: BarField,
  rows: readonly BarItem[],
): Partial<DetailBarStore> {
  const owner = barOwner(field);
  const existing = (state.states[sessionId] ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const group = existing[owner] ?? {};
  const cards = assembleBarItems(rows);

  return {
    states: {
      ...state.states,
      [sessionId]: {
        ...existing,
        [owner]: { ...group, [field]: cards },
      } as DetailBarState,
    },
  };
}

export const useDetailBarStore = create<DetailBarStore>((set) => ({
  states: {},
  rows: {},

  applyRows: (sessionId, field, rows, options = {}) =>
    set((current) => {
      const existing = current.rows[sessionId]?.[field];
      const byId: Record<string, BarItem> = options.replace
        ? {}
        : { ...(existing?.byId ?? {}) };
      for (const row of rows) byId[row.id] = row;

      return {
        rows: {
          ...current.rows,
          [sessionId]: { ...(current.rows[sessionId] ?? {}), [field]: { byId } },
        },
        ...withField(current, sessionId, field, Object.values(byId)),
      };
    }),

  applyRow: (sessionId, field, row) =>
    set((current) => {
      const existing = current.rows[sessionId]?.[field];
      const byId = { ...(existing?.byId ?? {}), [row.id]: row };

      return {
        rows: {
          ...current.rows,
          [sessionId]: { ...(current.rows[sessionId] ?? {}), [field]: { byId } },
        },
        ...withField(current, sessionId, field, Object.values(byId)),
      };
    }),
}));
