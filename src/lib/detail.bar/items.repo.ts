/**
 * Detail-bar rows: one row per card, one optional child level.
 *
 * Order is an immutable `seq`: newest cards have the highest value, and
 * editing a row never moves it. Pages are keyset on `(seq, id)`.
 *
 * @module @/lib/detail.bar/items.repo
 */
import { getDb } from "@/lib/db/database";
import { detailBarItems } from "@/lib/db/schema/schema";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

export type DetailBarItem = typeof detailBarItems.$inferSelect;

/** One card as assembled for the UI. */
export type DetailBarCard = Record<string, unknown> & { id: string };

export interface Cursor {
  seq: number;
  id: string;
}

/** `seq|id`, newest first. */
export function parseCursor(value?: string | null): Cursor | null {
  if (!value) return null;
  const index = value.lastIndexOf("|");
  if (index <= 0) return null;
  const seq = Number(value.slice(0, index));
  if (!Number.isFinite(seq)) return null;
  return { seq, id: value.slice(index + 1) };
}

export function formatCursor(row: DetailBarItem): string {
  return `${row.seq}|${row.id}`;
}

function keyset(cursor: Cursor | null) {
  if (!cursor) return undefined;
  return or(
    lt(detailBarItems.seq, cursor.seq),
    and(eq(detailBarItems.seq, cursor.seq), lt(detailBarItems.id, cursor.id)),
  );
}

interface Page {
  rows: DetailBarItem[];
  nextCursor: string | null;
}

function slicePage(rows: DetailBarItem[], limit: number): Page {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    rows: page,
    // A cursor exists only when another page does.
    nextCursor:
      hasMore && page.length > 0 ? formatCursor(page[page.length - 1]!) : null,
  };
}

/** One page of roots (parent_id NULL), newest first. */
export function getDetailBarItems(
  sessionId: string,
  field: string,
  options: { limit: number; cursor?: string | null },
): Page {
  const rows = getDb()
    .select()
    .from(detailBarItems)
    .where(
      and(
        eq(detailBarItems.sessionId, sessionId),
        eq(detailBarItems.field, field),
        isNull(detailBarItems.parentId),
        keyset(parseCursor(options.cursor)),
      ),
    )
    .orderBy(desc(detailBarItems.seq), desc(detailBarItems.id))
    .limit(options.limit + 1)
    .all();
  return slicePage(rows, options.limit);
}

/** One page of a parent's children, newest first. */
export function getDetailBarChildItems(
  sessionId: string,
  field: string,
  parentId: string,
  options: { limit: number; cursor?: string | null },
): Page {
  const rows = getDb()
    .select()
    .from(detailBarItems)
    .where(
      and(
        eq(detailBarItems.sessionId, sessionId),
        eq(detailBarItems.field, field),
        eq(detailBarItems.parentId, parentId),
        keyset(parseCursor(options.cursor)),
      ),
    )
    .orderBy(desc(detailBarItems.seq), desc(detailBarItems.id))
    .limit(options.limit + 1)
    .all();
  return slicePage(rows, options.limit);
}

/** Every root of one tab, newest first. */
export function readAllRootRows(
  sessionId: string,
  field: string,
): DetailBarItem[] {
  return getDb()
    .select()
    .from(detailBarItems)
    .where(
      and(
        eq(detailBarItems.sessionId, sessionId),
        eq(detailBarItems.field, field),
        isNull(detailBarItems.parentId),
      ),
    )
    .orderBy(desc(detailBarItems.seq), desc(detailBarItems.id))
    .all();
}

/** Roots created in `[startIso, endIso)`, newest first. */
export function getDetailBarPagesInDateRange(
  sessionId: string,
  field: string,
  startIso: string,
  endIso: string,
): DetailBarItem[] {
  return getDb()
    .select()
    .from(detailBarItems)
    .where(
      and(
        eq(detailBarItems.sessionId, sessionId),
        eq(detailBarItems.field, field),
        isNull(detailBarItems.parentId),
        gte(detailBarItems.createdAt, startIso),
        lt(detailBarItems.createdAt, endIso),
      ),
    )
    .orderBy(desc(detailBarItems.seq), desc(detailBarItems.id))
    .all();
}

/** All children of the given parents, newest first. */
export function readChildRows(
  sessionId: string,
  field: string,
  parentIds: readonly string[],
): DetailBarItem[] {
  if (parentIds.length === 0) return [];
  return getDb()
    .select()
    .from(detailBarItems)
    .where(
      and(
        eq(detailBarItems.sessionId, sessionId),
        eq(detailBarItems.field, field),
        inArray(detailBarItems.parentId, [...parentIds]),
      ),
    )
    .orderBy(
      desc(detailBarItems.parentId),
      desc(detailBarItems.seq),
      desc(detailBarItems.id),
    )
    .all();
}

/** One row by card id, whichever tab it lives in. */
export function getDetailBarItemById(
  sessionId: string,
  id: string,
): DetailBarItem | null {
  return (
    getDb()
      .select()
      .from(detailBarItems)
      .where(
        and(eq(detailBarItems.sessionId, sessionId), eq(detailBarItems.id, id)),
      )
      .get() ?? null
  );
}

/** Highest seq used under one parent (or roots). */
function maxSeq(
  sessionId: string,
  field: string,
  parentId: string | null,
): number {
  const row = getDb()
    .select({ seq: detailBarItems.seq })
    .from(detailBarItems)
    .where(
      and(
        eq(detailBarItems.sessionId, sessionId),
        eq(detailBarItems.field, field),
        parentId === null
          ? isNull(detailBarItems.parentId)
          : eq(detailBarItems.parentId, parentId),
      ),
    )
    .orderBy(desc(detailBarItems.seq))
    .limit(1)
    .get();
  return row?.seq ?? 0;
}

/**
 * Insert or refresh cards. New cards take the next seq under their
 * parent; existing cards keep theirs, so edits never reorder the list.
 */
export function writeDetailBarItems(
  sessionId: string,
  sessionSlug: string,
  field: string,
  items: ReadonlyArray<{
    id: string;
    parentId: string | null;
    status: string | null;
    data: Record<string, unknown>;
  }>,
): DetailBarItem[] {
  if (items.length === 0) return [];
  const now = new Date().toISOString();
  const written: DetailBarItem[] = [];

  const existingRows = getDb()
    .select()
    .from(detailBarItems)
    .where(
      and(
        eq(detailBarItems.sessionId, sessionId),
        eq(detailBarItems.field, field),
        inArray(
          detailBarItems.id,
          items.map((item) => item.id),
        ),
      ),
    )
    .all();
  const existingById = new Map(existingRows.map((row) => [row.id, row]));

  const remaining = new Map<string, number>();
  for (const item of items) {
    const key = item.parentId ?? "";
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const baseByParent = new Map<string, number>();

  for (const item of items) {
    const parentKey = item.parentId ?? "";
    const left = remaining.get(parentKey) ?? 1;
    remaining.set(parentKey, left - 1);
    if (!baseByParent.has(parentKey)) {
      baseByParent.set(parentKey, maxSeq(sessionId, field, item.parentId));
    }
    const seq = (baseByParent.get(parentKey) ?? 0) + left;
    const existing = existingById.get(item.id);
    const data = existing
      ? deepMerge(existing.data as Record<string, unknown>, item.data)
      : item.data;

    const values = {
      sessionId,
      sessionSlug,
      field,
      id: item.id,
      parentId: item.parentId,
      status: item.status,
      data,
      seq,
      updatedAt: now,
    };
    const db = getDb();
    const saved = db
      .insert(detailBarItems)
      .values(values)
      .onConflictDoUpdate({
        target: [
          detailBarItems.id,
          detailBarItems.field,
          detailBarItems.sessionId,
        ],
        set: {
          data,
          sessionSlug,
          updatedAt: now,
          status: sql`coalesce(${item.status}, ${detailBarItems.status})`,
          parentId: item.parentId,
        },
      })
      .returning()
      .get();
    if (saved) written.push(saved);
  }

  return written;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Objects merge key by key; arrays, scalars, and null replace. */
function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    merged[key] =
      isPlainObject(value) && isPlainObject(merged[key])
        ? deepMerge(merged[key] as Record<string, unknown>, value)
        : value;
  }
  return merged;
}
