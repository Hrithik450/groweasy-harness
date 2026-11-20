"use client";

/**
 * Detail-bar pages held by the client.
 *
 * One flat map keyed by level: `campaigns` holds a tab's roots,
 * `campaigns.ads:cmp-1` holds that campaign's ads. Levels only grow: live
 * events merge by id (rows are append-only, `seq` never changes), and only a
 * session change, Refresh, or reconnect replaces a page.
 *
 * @module @/store/detail.bar.store
 */

import { create } from "zustand";
import type { DetailBarField } from "@/lib/detail.bar/fields";

/** Key of one level: the field itself for roots, `field:parentId` for children. */
export function levelKey(
  field: DetailBarField,
  parentId: string | null,
): string {
  return parentId ? `${field}:${parentId}` : field;
}

/** One level's cards, or `undefined` before they were fetched. */
export function readPage(
  pages: Record<string, unknown[]>,
  field: DetailBarField,
  parentId: string | null = null,
): unknown[] | undefined {
  return pages[levelKey(field, parentId)];
}

/** One level's cursor: `undefined` unknown, `null` end of list. */
export function readCursor(
  cursors: Record<string, string | null>,
  field: DetailBarField,
  parentId: string | null = null,
): string | null | undefined {
  return cursors[levelKey(field, parentId)];
}

function idOf(item: unknown): string | undefined {
  const id = (item as { id?: unknown })?.id;
  return typeof id === "string" ? id : undefined;
}

/** Newest first; cards without a seq keep their relative position. */
function seqOf(item: unknown): number {
  const seq = (item as { seq?: unknown })?.seq;
  return typeof seq === "number" ? seq : Number.NEGATIVE_INFINITY;
}

interface DetailBarStore {
  /** Level key → cards, always newest first. */
  pages: Record<string, unknown[]>;
  /** Level key → keyset cursor of the oldest loaded card. */
  cursors: Record<string, string | null>;
  /** Authoritative page: session seed, Refresh, reconnect, first fetch. */
  replacePage: (
    field: DetailBarField,
    parentId: string | null,
    items: unknown[],
    nextCursor?: string | null,
  ) => void;
  /** Live page: union by id, replace known cards, keep everything loaded. */
  mergePage: (
    field: DetailBarField,
    parentId: string | null,
    items: unknown[],
    nextCursor?: string | null,
  ) => void;
  /** One changed card; inserts it when it is not loaded yet. */
  setItem: (
    field: DetailBarField,
    parentId: string | null,
    card: unknown,
  ) => void;
  /** Drop everything (session changed). */
  reset: () => void;
}

export const useDetailBarStore = create<DetailBarStore>((set, get) => ({
  pages: {},
  cursors: {},

  replacePage: (field, parentId, items, nextCursor) =>
    set((state) => {
      const key = levelKey(field, parentId);
      const cursors = { ...state.cursors };
      if (nextCursor === undefined) delete cursors[key];
      else cursors[key] = nextCursor;
      return {
        pages: { ...state.pages, [key]: items },
        cursors,
      };
    }),

  mergePage: (field, parentId, items, nextCursor) =>
    set((state) => {
      const key = levelKey(field, parentId);
      const merged = (state.pages[key] ?? []).slice();
      const at = new Map<string, number>();
      merged.forEach((item, index) => {
        const id = idOf(item);
        if (id) at.set(id, index);
      });

      for (const item of items) {
        const id = idOf(item);
        if (!id) continue;
        const index = at.get(id);
        if (index === undefined) {
          at.set(id, merged.length);
          merged.push(item);
        } else {
          merged[index] = item;
        }
      }
      // Same order as the server: seq DESC, then id DESC (binary text compare).
      merged.sort((a, b) => {
        const bySeq = seqOf(b) - seqOf(a);
        if (bySeq !== 0) return bySeq;
        const idA = idOf(a) ?? "";
        const idB = idOf(b) ?? "";
        return idA < idB ? 1 : idA > idB ? -1 : 0;
      });

      const cursors =
        nextCursor === undefined
          ? state.cursors
          : { ...state.cursors, [key]: nextCursor };

      return {
        pages: { ...state.pages, [key]: merged },
        cursors,
      };
    }),

  setItem: (field, parentId, card) => {
    if (!idOf(card)) return;
    get().mergePage(field, parentId, [card]);
  },

  reset: () => set({ pages: {}, cursors: {} }),
}));
