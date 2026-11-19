/**
 * Storage for detail-bar cards.
 *
 * One row per card, self-referencing through `parent_id` so a tab can nest
 * (campaign → ad → creative). Rows are mutable, so a list reads newest-first by
 * `updated_at` and pages through a `(updatedAt, id)` keyset cursor.
 *
 * @module @/lib/bar/items.repo
 */

import { and, desc, eq, inArray, or, sql, lt } from "drizzle-orm";
import { getDb, barItems } from "@/lib/db";
import {
  barRetention,
  maxDepthFor,
  retainAtDepth,
  rootKind,
  type BarField,
  type BarItem,
  type BarPage,
} from "@/lib/detail.bar/fields";

/** One card as a caller supplies it. */
export interface BarItemInput {
  id: string;
  data: object;
  parentId?: string | null;
  depth?: number;
  status?: string | null;
  error?: string | null;
}

/** Stored rows as the DB holds them. */
type Row = typeof barItems.$inferSelect;

function toItem(row: Row): BarItem {
  return {
    ...row.data,
    id: row.id,
    kind: row.kind,
    parentId: row.parentId,
    depth: row.depth,
    ...(row.status === null ? {} : { status: row.status }),
    ...(row.error === null ? {} : { error: row.error }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Cursor for one row: `updatedAt|id`, newest first. */
function cursorOf(row: Row): string {
  return `${row.updatedAt}|${row.id}`;
}

function parseCursor(cursor: string | null | undefined): {
  updatedAt: string;
  id: string;
} | null {
  if (!cursor) return null;
  const index = cursor.lastIndexOf("|");
  if (index <= 0) return null;
  return {
    updatedAt: cursor.slice(0, index),
    id: cursor.slice(index + 1),
  };
}

/**
 * Read one page of a tab: roots only, newest first.
 *
 * @param cursor - `nextCursor` from the previous page.
 */
export function readBarPage(
  sessionId: string,
  kind: string,
  options: { limit?: number; cursor?: string | null } = {},
): BarPage {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const after = parseCursor(options.cursor);
  const db = getDb();

  const rows = db
    .select()
    .from(barItems)
    .where(
      after
        ? and(
            eq(barItems.sessionId, sessionId),
            eq(barItems.kind, kind),
            sql`${barItems.parentId} IS NULL`,
            or(
              lt(barItems.updatedAt, after.updatedAt),
              and(
                eq(barItems.updatedAt, after.updatedAt),
                lt(barItems.id, after.id),
              ),
            ),
          )
        : and(
            eq(barItems.sessionId, sessionId),
            eq(barItems.kind, kind),
            sql`${barItems.parentId} IS NULL`,
          ),
    )
    .orderBy(desc(barItems.updatedAt), desc(barItems.id))
    .limit(limit + 1)
    .all() as Row[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return {
    items: page.map(toItem),
    nextCursor: hasMore && last ? cursorOf(last) : null,
    hasMore,
  };
}

/** Read one page of one parent's children, newest first. */
export function readBarChildrenPage(
  sessionId: string,
  parentId: string,
  options: { limit?: number; cursor?: string | null; kind?: string | null } = {},
): BarPage {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const after = parseCursor(options.cursor);
  const db = getDb();
  const kindFilter =
    options.kind === undefined || options.kind === null
      ? undefined
      : eq(barItems.kind, options.kind);

  const rows = db
    .select()
    .from(barItems)
    .where(
      after
        ? and(
            eq(barItems.sessionId, sessionId),
            eq(barItems.parentId, parentId),
            kindFilter,
            or(
              lt(barItems.updatedAt, after.updatedAt),
              and(
                eq(barItems.updatedAt, after.updatedAt),
                lt(barItems.id, after.id),
              ),
            ),
          )
        : and(
            eq(barItems.sessionId, sessionId),
            eq(barItems.parentId, parentId),
            kindFilter,
          ),
    )
    .orderBy(desc(barItems.updatedAt), desc(barItems.id))
    .limit(limit + 1)
    .all() as Row[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return {
    items: page.map(toItem),
    nextCursor: hasMore && last ? cursorOf(last) : null,
    hasMore,
  };
}

/** Read every child row of the given parents, newest last per parent. */
export function readBarChildren(
  sessionId: string,
  parentIds: readonly string[],
): BarItem[] {
  if (parentIds.length === 0) return [];
  const rows = getDb()
    .select()
    .from(barItems)
    .where(
      and(
        eq(barItems.sessionId, sessionId),
        inArray(barItems.parentId, [...parentIds]),
      ),
    )
    .orderBy(desc(barItems.updatedAt), desc(barItems.id))
    .all() as Row[];
  return rows.map(toItem);
}

/** Read one row by its business id inside a bar. */
export function readBarItem(sessionId: string, id: string): BarItem | null {
  const row = getDb()
    .select()
    .from(barItems)
    .where(and(eq(barItems.sessionId, sessionId), eq(barItems.id, id)))
    .get() as Row | undefined;
  return row ? toItem(row) : null;
}

/** Read one row's raw stored payload, without the row metadata. */
export function readStoredBarData(
  sessionId: string,
  id: string,
): Record<string, unknown> | null {
  const row = getDb()
    .select({ content: barItems.data })
    .from(barItems)
    .where(and(eq(barItems.sessionId, sessionId), eq(barItems.id, id)))
    .get();
  return (row?.content as Record<string, unknown> | undefined) ?? null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merge a patch into stored data: objects recurse, everything else replaces.
 *
 * A row patch names only the fields the user owns, so an unrelated field the
 * agent just refreshed is never touched.
 */
export function mergeBarData(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] =
      isPlainObject(current) && isPlainObject(value)
        ? mergeBarData(current, value)
        : value;
  }
  return merged;
}

/**
 * Upsert cards into one tab and prune the tab to its retention bound.
 *
 * An existing id keeps its `createdAt`; `updatedAt` moves, which is also the
 * list order.
 *
 * @returns the written rows, flattened.
 */
export function upsertBarItems(
  sessionId: string,
  kind: string,
  items: readonly BarItemInput[],
  options: { replace?: boolean } = {},
): BarItem[] {
  if (items.length === 0) return [];

  const db = getDb();
  const now = new Date().toISOString();
  const root = rootKind(kind);
  const maxDepth = maxDepthFor(root);

  const written = db.transaction((tx) => {
    const out: BarItem[] = [];

    for (const item of items) {
      const depth = Math.min(Math.max(item.depth ?? 0, 0), maxDepth);
      const existing = tx
        .select()
        .from(barItems)
        .where(and(eq(barItems.sessionId, sessionId), eq(barItems.id, item.id)))
        .get() as Row | undefined;

      const values = {
        sessionId,
        id: item.id,
        kind,
        parentId: item.parentId ?? null,
        depth,
        status: item.status ?? null,
        error: item.error ?? null,
        data: item.data as Record<string, unknown>,
        updatedAt: now,
      };

      if (existing) {
        tx.update(barItems)
          .set(values)
          .where(and(eq(barItems.sessionId, sessionId), eq(barItems.id, item.id)))
          .run();
        out.push(toItem({ ...existing, ...values } as Row));
        continue;
      }

      const row = { ...values, createdAt: now };
      tx.insert(barItems).values(row).run();
      out.push(toItem(row as Row));
    }

    // A synced tab is authoritative: roots the source dropped go, with children.
    if (options.replace === true) {
      const keep = new Set(
        items.filter((item) => !item.parentId).map((item) => item.id),
      );
      const roots = tx
        .select({ id: barItems.id })
        .from(barItems)
        .where(
          and(
            eq(barItems.sessionId, sessionId),
            eq(barItems.kind, kind),
            sql`${barItems.parentId} IS NULL`,
          ),
        )
        .all();
      for (const row of roots) {
        if (keep.has(row.id)) continue;
        tx.delete(barItems)
          .where(and(eq(barItems.sessionId, sessionId), eq(barItems.id, row.id)))
          .run();
      }
    }

    // Retention: drop the oldest roots, children go with them.
    const retain = barRetention(root);
    const roots = tx
      .select({ id: barItems.id })
      .from(barItems)
      .where(
        and(
          eq(barItems.sessionId, sessionId),
          eq(barItems.kind, kind),
          sql`${barItems.parentId} IS NULL`,
        ),
      )
      .orderBy(desc(barItems.updatedAt), desc(barItems.id))
      .all();
    for (const row of roots.slice(retain)) {
      tx.delete(barItems)
        .where(and(eq(barItems.sessionId, sessionId), eq(barItems.id, row.id)))
        .run();
    }

    // Child retention: each parent keeps its newest rows at that depth.
    const childDepth = new Map<string, number>();
    for (const item of items) {
      if (!item.parentId) continue;
      childDepth.set(item.parentId, item.depth ?? 1);
    }
    for (const [parentId, depth] of childDepth) {
      const keepChildren = retainAtDepth(root, depth);
      const children = tx
        .select({ id: barItems.id })
        .from(barItems)
        .where(
          and(
            eq(barItems.sessionId, sessionId),
            eq(barItems.kind, kind),
            eq(barItems.parentId, parentId),
          ),
        )
        .orderBy(desc(barItems.updatedAt), desc(barItems.id))
        .all();
      for (const row of children.slice(keepChildren)) {
        tx.delete(barItems)
          .where(and(eq(barItems.sessionId, sessionId), eq(barItems.id, row.id)))
          .run();
      }
    }

    return out;
  });

  return written;
}

/** Count root rows in one tab, for badges. */
export function countBarItems(sessionId: string, kind: BarField): number {
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(barItems)
    .where(
      and(
        eq(barItems.sessionId, sessionId),
        eq(barItems.kind, kind),
        sql`${barItems.parentId} IS NULL`,
      ),
    )
    .get();
  return row?.count ?? 0;
}
