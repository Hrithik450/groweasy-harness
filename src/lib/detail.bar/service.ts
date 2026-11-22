/**
 * Detail-bar service: one row per card; every level is a flat field path.
 *
 * `campaigns` holds roots; `campaigns.ads` holds ads linked by `parent_id`.
 * Reads are lazy per level and ordered by the immutable `seq`.
 *
 * @module @/lib/detail.bar/service
 */

import type { Session, SessionSlug } from "@/lib/db";
import {
  allDetailBarFieldsOf,
  barOwner,
  isDetailBarField,
  tabParentPath,
  tabRetention,
  topDetailBarFieldsOf,
  type DetailBarField,
} from "@/lib/detail.bar/fields";
import type { DetailBarState } from "@/lib/detail.bar/state";
import {
  getSessionById,
  getSessionByUserIdAndSlug,
} from "@/lib/repositories/sessions.repo";
import { publish } from "@/lib/session/bus";
import { sessionKey } from "@/lib/session/keys";
import { SESSION_DETAIL_BAR_EVENT } from "@/lib/session/journal";
import { getDb } from "@/lib/db/database";
import {
  readAllRootRows,
  getDetailBarChildItems,
  getDetailBarItems,
  getDetailBarItemById,
  writeDetailBarItems,
  type DetailBarCard,
  type DetailBarItem,
} from "./items.repo";

export type { DetailBarCard };

/** One card handed to {@link upsertDetailBarItems}. */
export interface BarItemInput {
  id: string;
  parentId?: string | null;
  data?: object;
  status?: string | null;
  error?: string | null;
  [key: string]: unknown;
}

/** The bar that owns a field, or `null` when the user has no such session. */
export function resolveDetailBarSession(
  userId: string,
  field: DetailBarField,
): Session | null {
  if (!isDetailBarField(field)) return null;
  return getSessionByUserIdAndSlug(userId, barOwner(field)) ?? null;
}

/** One stored row as the client reads it: card data, id, and the status column. */
function rowToItem(row: DetailBarItem): DetailBarCard {
  return {
    ...(row.data as Record<string, unknown>),
    id: row.id,
    seq: row.seq,
    ...(row.status ? { status: row.status } : {}),
  };
}

/** Root cards of one tab, newest first. Children load only when opened. */
export function getDetailBarRootPage(
  sessionId: string,
  field: DetailBarField,
  options: { limit?: number; cursor?: string | null } = {},
): { items: DetailBarCard[]; nextCursor: string | null } {
  const page = getDetailBarItems(sessionId, field, {
    limit: options.limit ?? tabRetention(field),
    cursor: options.cursor,
  });
  return {
    items: page.rows.map((row) => rowToItem(row)),
    nextCursor: page.nextCursor,
  };
}

/** One parent's children, newest first. */
export function getDetailBarChildrenPage(
  sessionId: string,
  field: DetailBarField,
  parentId: string,
  options: { limit?: number; cursor?: string | null } = {},
): { items: DetailBarCard[]; nextCursor: string | null } {
  const page = getDetailBarChildItems(sessionId, field, parentId, {
    limit: options.limit ?? tabRetention(field),
    cursor: options.cursor,
  });
  return {
    items: page.rows.map((row) => rowToItem(row)),
    nextCursor: page.nextCursor,
  };
}

/** Publish one changed card; clients replace it in place by id. */
function publishItem(
  session: Session,
  field: DetailBarField,
  parentId: string | null,
  item: DetailBarCard,
): void {
  publish(sessionKey(session.id), {
    event: SESSION_DETAIL_BAR_EVENT,
    data: { type: "item", field, parentId, items: [item] },
  });
}

/** Read one level and publish it: roots when `parentId` is null. */
function publishPage(
  session: Session,
  field: DetailBarField,
  parentId: string | null,
): void {
  const page =
    parentId === null
      ? getDetailBarRootPage(session.id, field)
      : getDetailBarChildrenPage(session.id, field, parentId);

  publish(sessionKey(session.id), {
    event: SESSION_DETAIL_BAR_EVENT,
    data: { type: "items", field, parentId, items: page.items },
  });
}

/** Publish the page holding each row, then each ancestor page up to roots. */
function publishPages(
  session: Session,
  field: DetailBarField,
  rowIds: readonly string[],
): void {
  let ids = [...rowIds];
  let current: DetailBarField | null = field;

  while (current && ids.length > 0) {
    const rows = ids
      .map((id) => getDetailBarItemById(session.id, id))
      .filter((row): row is DetailBarItem => row !== null);
    if (rows.length === 0) return;

    // The page each row appears on: its own parent id (null = roots).
    const contexts = new Set<string | null>(rows.map((row) => row.parentId));
    for (const parentId of contexts) {
      publishPage(session, current, parentId);
    }

    ids = rows
      .map((row) => row.parentId)
      .filter((id): id is string => typeof id === "string");
    current = tabParentPath(current);
  }
}

interface RowWrite {
  id: string;
  field: DetailBarField;
  parentId: string | null;
  status: string | null;
  data: Record<string, unknown>;
}

/**
 * Write cards into the level that owns them.
 *
 * A root field takes roots; a child field takes rows with a `parentId`. Writes
 * and retention run in one transaction, and the parent link is a real FK.
 *
 * @returns the written cards, or `null` when the session is missing.
 */
export function upsertDetailBarItems(
  session: Session,
  field: DetailBarField,
  items: readonly BarItemInput[],
): DetailBarCard[] {
  const slug = session.slug ?? barOwner(field);

  const rows: RowWrite[] = items.map((item) => ({
    id: item.id,
    field,
    parentId: item.parentId ?? null,
    status: item.status ?? null,
    data: (item.data ?? {}) as Record<string, unknown>,
  }));

  const written = getDb().transaction(() =>
    writeDetailBarItems(session.id, slug, field, rows),
  );

  publishPages(
    session,
    field,
    written.map((row) => row.id),
  );

  return written.map((row) => rowToItem(row));
}

/**
 * Merge a user patch into one stored card and publish its level.
 *
 * @returns the updated card, or `null` when the row does not exist.
 */
export function updateDetailBarItem(
  session: Session,
  id: string,
  patch: Record<string, unknown>,
  field?: DetailBarField,
): DetailBarCard | null {
  const status = typeof patch.status === "string" ? patch.status : undefined;
  const error = typeof patch.error === "string" ? patch.error : undefined;
  if (status === undefined && error === undefined) return null;

  const row = getDetailBarItemById(session.id, id);
  if (!row) return null;
  if (field && row.field !== field) return null;

  const data = { ...(row.data as Record<string, unknown>) };
  if (error !== undefined) {
    if (row.field === "alerts") data.note = error;
    else data.error = error;
  }

  const [written] = writeDetailBarItems(
    session.id,
    session.slug ?? row.sessionSlug,
    row.field,
    [
      {
        id,
        parentId: row.parentId,
        status: status ?? row.status,
        data,
      },
    ],
  );
  if (!written) return null;

  publishItem(
    session,
    row.field as DetailBarField,
    row.parentId,
    rowToItem(written),
  );
  return rowToItem(written);
}

/** Read one card by id inside one tab (cards only, no children). */
export function readBarItemFor(
  userId: string,
  field: DetailBarField,
  id: string,
): DetailBarCard | null {
  const session = resolveDetailBarSession(userId, field);
  if (!session) return null;
  const row = getDetailBarItemById(session.id, id);
  return row && row.field === field ? rowToItem(row) : null;
}

/** Read one card by id when only the session id is known. */
export function readBarItemForSession(
  sessionId: string,
  id: string,
): DetailBarCard | null {
  const session = getSessionById(sessionId);
  if (!session) return null;
  const row = getDetailBarItemById(session.id, id);
  return row ? rowToItem(row) : null;
}

/** Read one card by id and tab, so a page cannot open another tab's row. */
export function readBarItemForSessionField(
  sessionId: string,
  field: DetailBarField,
  id: string,
): DetailBarCard | null {
  const session = getSessionById(sessionId);
  if (!session) return null;
  const row = getDetailBarItemById(session.id, id);
  return row && row.field === field ? rowToItem(row) : null;
}

/** The newest card in one root tab, or `null` when it is empty. */
export function latestBarItemFor(
  userId: string,
  field: DetailBarField,
): DetailBarCard | null {
  const session = resolveDetailBarSession(userId, field);
  if (!session) return null;
  const row: DetailBarItem | undefined = readAllRootRows(session.id, field)[0];
  return row ? rowToItem(row) : null;
}

/**
 * One page of a field: its roots when `parentId` is absent, the rows linked
 * to that parent when it is present.
 */
export function getDetailBarPage(
  sessionId: string,
  field: DetailBarField,
  options: {
    limit?: number;
    cursor?: string | null;
    parentId?: string | null;
  } = {},
): { items: DetailBarCard[]; nextCursor: string | null } {
  if (options.parentId) {
    if (!tabParentPath(field)) return { items: [], nextCursor: null };
    return getDetailBarChildrenPage(sessionId, field, options.parentId, {
      limit: options.limit,
      cursor: options.cursor,
    });
  }
  return getDetailBarRootPage(sessionId, field, {
    limit: options.limit,
    cursor: options.cursor,
  });
}

/** Every bar root tab of the session: roots only, no children. */
export function getDetailBarSnapshot(session: Session): DetailBarState {
  if (!session.slug) return {};
  const group: Record<string, DetailBarCard[]> = {};
  for (const field of topDetailBarFieldsOf(session.slug)) {
    group[field] = getDetailBarRootPage(session.id, field, {
      limit: tabRetention(field),
    }).items;
  }
  return {
    [session.slug as SessionSlug]: group,
  } as unknown as DetailBarState;
}

/** Tab ids of the bar that owns a session slug (kept for callers). */
export function barFieldsOf(slug: string): DetailBarField[] {
  return allDetailBarFieldsOf(slug);
}

export {
  getDetailBarItemById,
  readAllRootRows,
  readChildRows,
} from "./items.repo";
