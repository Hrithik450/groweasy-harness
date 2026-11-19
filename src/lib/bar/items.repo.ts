/**
 * Detail-bar rows: one row per card, one optional child level.
 *
 * @module @/lib/bar/items.repo
 */

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
} from "drizzle-orm";
import { getDb } from "@/lib/db/database";
import { detailBarItems } from "@/lib/db/schema/schema";

export type DetailBarRow = typeof detailBarItems.$inferSelect;

/** One card as assembled for the UI. */
export type BarCard = Record<string, unknown> & { id: string };

export interface Cursor {
  updatedAt: string;
  id: string;
}

/** `updatedAt|id`, newest first. */
export function parseCursor(value?: string | null): Cursor | null {
  if (!value) return null;
  const index = value.lastIndexOf("|");
  if (index <= 0) return null;
  return { updatedAt: value.slice(0, index), id: value.slice(index + 1) };
}

export function formatCursor(row: DetailBarRow): string {
  return `${row.updatedAt}|${row.id}`;
}

/** One page of roots (parent_id NULL), newest first, keyset by cursor. */
export function readRootRows(
  sessionId: string,
  field: string,
  options: { limit: number; cursor?: string | null },
): { rows: DetailBarRow[]; nextCursor: string | null } {
  const cursor = parseCursor(options.cursor);
  const where = [
    eq(detailBarItems.sessionId, sessionId),
    eq(detailBarItems.field, field),
    isNull(detailBarItems.parentId),
    ...(cursor
      ? [
          or(
            lt(detailBarItems.updatedAt, cursor.updatedAt),
            and(
              eq(detailBarItems.updatedAt, cursor.updatedAt),
              lt(detailBarItems.id, cursor.id),
            ),
          )!,
        ]
      : []),
  ];

  const rows = getDb()
    .select()
    .from(detailBarItems)
    .where(and(...where))
    .orderBy(desc(detailBarItems.updatedAt), desc(detailBarItems.id))
    .limit(options.limit + 1)
    .all();

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  return {
    rows: page,
    // A cursor exists only when another page does.
    nextCursor:
      hasMore && page.length > 0 ? formatCursor(page[page.length - 1]!) : null,
  };
}

/** Every root of one tab, newest first. */
export function readAllRootRows(sessionId: string, field: string): DetailBarRow[] {
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
    .orderBy(desc(detailBarItems.updatedAt), desc(detailBarItems.id))
    .all();
}

/** Children of the given parents, newest first. */
export function readChildRows(
  sessionId: string,
  field: string,
  parentIds: readonly string[],
): DetailBarRow[] {
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
    .orderBy(desc(detailBarItems.updatedAt), asc(detailBarItems.id))
    .all();
}

/** One row by card id, whichever tab it lives in. */
export function readRowByCardId(
  sessionId: string,
  id: string,
): DetailBarRow | null {
  return (
    getDb()
      .select()
      .from(detailBarItems)
      .where(and(eq(detailBarItems.sessionId, sessionId), eq(detailBarItems.id, id)))
      .get() ?? null
  );
}

/** Insert or refresh cards; `updated_at` moves to now on every write. */
export function upsertRows(
  sessionId: string,
  sessionSlug: string,
  field: string,
  rows: ReadonlyArray<{
    id: string;
    parentId: string | null;
    status: string | null;
    data: Record<string, unknown>;
    /** Keep a card's place in the list, e.g. on a status patch. */
    updatedAt?: string;
  }>,
): DetailBarRow[] {
  if (rows.length === 0) return [];
  const base = Date.now();
  const written: DetailBarRow[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    // Input order is display order: first card is newest.
    const updatedAt =
      row.updatedAt ??
      new Date(base + (rows.length - index)).toISOString();
    const values = {
      sessionId,
      sessionSlug,
      field,
      id: row.id,
      parentId: row.parentId,
      status: row.status,
      data: row.data,
      updatedAt,
    };
    const saved = getDb()
      .insert(detailBarItems)
      .values(values)
      .onConflictDoUpdate({
        target: [
          detailBarItems.sessionId,
          detailBarItems.field,
          detailBarItems.id,
        ],
        set: {
          sessionSlug,
          parentId: row.parentId,
          status: row.status,
          data: row.data,
          updatedAt,
        },
      })
      .returning()
      .get();
    if (saved) written.push(saved);
  }

  return written;
}

/** Delete ad rows whose campaign was trimmed away. */
export function pruneOrphanChildren(sessionId: string, field: string): void {
  getDb()
    .delete(detailBarItems)
    .where(
      and(
        eq(detailBarItems.sessionId, sessionId),
        eq(detailBarItems.field, field),
        isNotNull(detailBarItems.parentId),
        notInArray(
          detailBarItems.parentId,
          getDb()
            .select({ id: detailBarItems.id })
            .from(detailBarItems)
            .where(
              and(
                eq(detailBarItems.sessionId, sessionId),
                eq(detailBarItems.field, field),
                isNull(detailBarItems.parentId),
              ),
            ),
        ),
      ),
    )
    .run();
}

/** Delete rows beyond `keep`, newest first, for one parent (or roots). */
export function pruneRows(
  sessionId: string,
  field: string,
  parentId: string | null,
  keep: number,
): void {
  const keepIds = getDb()
    .select({ id: detailBarItems.id })
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
    .orderBy(desc(detailBarItems.updatedAt), desc(detailBarItems.id))
    .limit(keep)
    .all()
    .map((row) => row.id);

  if (keepIds.length === 0) return;
  getDb()
    .delete(detailBarItems)
    .where(
      and(
        eq(detailBarItems.sessionId, sessionId),
        eq(detailBarItems.field, field),
        parentId === null
          ? isNull(detailBarItems.parentId)
          : eq(detailBarItems.parentId, parentId),
        notInArray(detailBarItems.id, keepIds),
      ),
    )
    .run();
}
