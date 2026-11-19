/**
 * Detail-bar service: one row per card, one optional child level.
 *
 * Campaigns own their ads through `parent_id`; every tab reads and writes the
 * same way. Pages and retention are SQL over indexed columns.
 *
 * @module @/lib/bar/service
 */

import type { Session } from "@/lib/db";
import {
  allBarFieldsOf,
  barOwner,
  isBarField,
  SNAPSHOT_ROOTS,
  tabChildren,
  tabRetention,
  BAR_STATUSES,
  type BarField,
} from "@/lib/detail.bar/fields";
import type { DetailBarState } from "@/lib/detail.bar/state";
import {
  getSessionById,
  getSessionByUserIdAndSlug,
} from "@/lib/repositories/sessions.repo";
import { resolveDetailBarType } from "@/lib/detail.bar/utils";
import { publish } from "@/lib/session/bus";
import { sessionKey } from "@/lib/session/keys";
import { SESSION_DETAIL_BAR_EVENT } from "@/lib/session/journal";
import {
  formatCursor,
  pruneOrphanChildren,
  pruneRows,
  readAllRootRows,
  readChildRows,
  readRootRows,
  readRowByCardId,
  upsertRows,
  type BarCard,
  type DetailBarRow,
} from "./items.repo";

export type { BarCard };

/** One card handed to {@link saveBarItems}. */
export interface BarItemInput {
  id: string;
  data?: object;
  status?: string | null;
  error?: string | null;
  [key: string]: unknown;
}

const USER_STATUSES = new Set<string>(BAR_STATUSES);

/** The bar that owns a field, or `null` when the user has no such session. */
export function resolveBarSession(
  userId: string,
  field: BarField,
): Session | null {
  if (!isBarField(field)) return null;
  return getSessionByUserIdAndSlug(userId, barOwner(field)) ?? null;
}

function rowToCard(row: DetailBarRow, withStatusIntoAction = false): BarCard {
  const card: BarCard = {
    ...(row.data as Record<string, unknown>),
    id: row.id,
  };
  if (row.status) {
    card.status = row.status;
    if (withStatusIntoAction) {
      const action =
        typeof card.action === "object" && card.action !== null
          ? { ...(card.action as Record<string, unknown>) }
          : { fix: "" };
      card.action = { ...action, status: row.status };
    }
  }
  return card;
}

/** Every descendant of the given roots, level by level, as configured. */
function readSubtree(
  sessionId: string,
  field: BarField,
  roots: readonly DetailBarRow[],
): DetailBarRow[] {
  const all: DetailBarRow[] = [...roots];
  let frontier = roots.map((row) => row.id);
  let config = tabChildren(field);

  while (config && frontier.length > 0) {
    const kids = readChildRows(sessionId, field, frontier);
    if (kids.length === 0) break;
    all.push(...kids);
    frontier = kids.map((row) => row.id);
    config = config.children;
  }

  return all;
}

/** Attach descendants under their configured keys, at any depth. */
function assembleRows(
  rows: readonly DetailBarRow[],
  rootRows: readonly DetailBarRow[],
  config: ReturnType<typeof tabChildren>,
): BarCard[] {
  const byParent = new Map<string, DetailBarRow[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const list = byParent.get(row.parentId) ?? [];
    list.push(row);
    byParent.set(row.parentId, list);
  }

  const build = (
    row: DetailBarRow,
    level: ReturnType<typeof tabChildren>,
  ): BarCard => {
    const card = rowToCard(row, row.parentId !== null);
    if (!level) return card;
    const kids = (byParent.get(row.id) ?? []).map((kid) =>
      build(kid, level.children),
    );
    return kids.length > 0 ? { ...card, [level.key]: kids } : card;
  };

  return rootRows.map((row) => build(row, config));
}

/** Roots of one tab, children included, newest first. */
function readAssembled(
  sessionId: string,
  field: BarField,
  options: { limit?: number; cursor?: string | null } = {},
): { items: BarCard[]; nextCursor: string | null } {
  const limit = options.limit ?? tabRetention(field);
  const page = readRootRows(sessionId, field, {
    limit,
    cursor: options.cursor,
  });
  const rows = readSubtree(sessionId, field, page.rows);
  return {
    items: assembleRows(rows, page.rows, tabChildren(field)),
    nextCursor: page.nextCursor,
  };
}

function publishField(session: Session, field: BarField): void {
  const page = readAssembled(session.id, field);
  publish(sessionKey(session.id), {
    event: SESSION_DETAIL_BAR_EVENT,
    data: {
      type: "field",
      sessionId: session.id,
      field,
      items: page.items,
    },
  });
}

interface RowWrite {
  id: string;
  parentId: string | null;
  status: string | null;
  data: Record<string, unknown>;
}

interface PruneTask {
  parentId: string;
  retain: number;
}

/** Split one nested array into rows, recursing into configured children. */
function splitLevel(
  config: NonNullable<ReturnType<typeof tabChildren>>,
  parentId: string,
  values: readonly unknown[],
  rows: RowWrite[],
  prune: PruneTask[],
): void {
  prune.push({ parentId, retain: config.retain });

  for (const value of values) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (!id) continue;

    const {
      id: _ignored,
      status: ownStatus,
      error: _ownError,
      ...rest
    } = record;
    const action =
      typeof rest.action === "object" && rest.action !== null
        ? (rest.action as Record<string, unknown>)
        : null;
    const status =
      typeof ownStatus === "string"
        ? ownStatus
        : typeof action?.status === "string"
          ? action.status
          : null;

    rows.push({ id, parentId, status, data: rest });

    if (config.children && Array.isArray(rest[config.children.key])) {
      splitLevel(
        config.children,
        id,
        rest[config.children.key] as readonly unknown[],
        rows,
        prune,
      );
      delete rest[config.children.key];
    }
  }
}

/** One incoming card split into its root row and every descendant row. */
function toRows(
  field: BarField,
  item: BarItemInput,
): { root: RowWrite; descendants: RowWrite[]; prune: PruneTask[] } {
  const { id, data, status, error } = item;
  const raw = { ...((data ?? {}) as Record<string, unknown>) };
  const descendants: RowWrite[] = [];
  const prune: PruneTask[] = [];

  const config = tabChildren(field);
  if (config && Array.isArray(raw[config.key])) {
    splitLevel(
      config,
      id,
      raw[config.key] as readonly unknown[],
      descendants,
      prune,
    );
    delete raw[config.key];
  }

  const cardStatus =
    typeof status === "string"
      ? status
      : typeof raw.status === "string"
        ? raw.status
        : null;
  const { status: _status, error: _error, ...rest } = raw;
  if (typeof error === "string" && field !== "alerts") rest.error = error;
  if (typeof error === "string" && field === "alerts") rest.note = error;

  return {
    root: { id, parentId: null, status: cardStatus, data: rest },
    descendants,
    prune,
  };
}

/**
 * Write cards into the tab that owns them.
 *
 * @returns the written root cards, or `null` when the session is missing.
 */
export function saveBarItems(
  userId: string,
  field: BarField,
  items: readonly BarItemInput[],
  options: { replace?: boolean } = {},
): { session: Session; items: BarCard[] } | null {
  const session = resolveBarSession(userId, field);
  if (!session) return null;

  const slug = session.slug ?? barOwner(field);
  if (options.replace === true) {
    const existing = readAllRootRows(session.id, field);
    for (const root of existing) {
      pruneRows(session.id, field, root.id, 0);
    }
    pruneRows(session.id, field, null, 0);
  }

  const roots: RowWrite[] = [];
  const descendants: RowWrite[] = [];
  const prune: PruneTask[] = [];

  for (const item of items) {
    const split = toRows(field, item);
    roots.push(split.root);
    descendants.push(...split.descendants);
    prune.push(...split.prune);
  }

  const writtenChildren = upsertRows(session.id, slug, field, descendants);
  const writtenRoots = upsertRows(session.id, slug, field, roots);

  pruneRows(session.id, field, null, tabRetention(field));
  for (const task of prune) {
    pruneRows(session.id, field, task.parentId, task.retain);
  }
  pruneOrphanChildren(session.id, field);

  publishField(session, field);

  if (writtenRoots.length === 0 && writtenChildren.length === 0) {
    return { session, items: [] };
  }
  return {
    session,
    items: writtenRoots.map((row) => rowToCard(row)),
  };
}

/** Keep only the fields a user owns, so a stale client cannot rewrite analysis. */
function userOwnedPatch(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const owned: Record<string, unknown> = {};
  if (typeof patch.status === "string" && USER_STATUSES.has(patch.status)) {
    owned.status = patch.status;
  }
  if (typeof patch.error === "string") owned.error = patch.error;
  return owned;
}

/**
 * Merge a user patch into one stored card and publish its tab.
 *
 * @returns the updated card, or `null` when the row does not exist.
 */
export function patchBarItem(
  session: Session,
  id: string,
  patch: Record<string, unknown>,
  field?: BarField,
): BarCard | null {
  const owned = userOwnedPatch(patch);
  if (Object.keys(owned).length === 0) return null;

  const row = readRowByCardId(session.id, id);
  if (!row) return null;
  if (field && row.field !== field) return null;

  const data = { ...(row.data as Record<string, unknown>) };
  if (typeof owned.error === "string") {
    if (row.field === "alerts") data.note = owned.error;
    else data.error = owned.error;
  }

  const [written] = upsertRows(
    session.id,
    session.slug ?? row.sessionSlug,
    row.field,
    [
      {
        id,
        parentId: row.parentId,
        status: typeof owned.status === "string" ? owned.status : row.status,
        data,
        updatedAt: row.updatedAt,
      },
    ],
  );
  if (!written) return null;

  publishField(session, row.field as BarField);
  return rowToCard(written, row.parentId !== null);
}

/** Read one card by id inside one tab, children attached for campaigns. */
export function readBarItemFor(
  userId: string,
  field: BarField,
  id: string,
): BarCard | null {
  const session = resolveBarSession(userId, field);
  if (!session) return null;
  const row = readRowByCardId(session.id, id);
  if (!row || row.field !== field) return null;
  if (!tabChildren(field)) return rowToCard(row);
  const rows = readSubtree(session.id, field, [row]);
  return assembleRows(rows, [row], tabChildren(field))[0] ?? rowToCard(row);
}

/** Read one card by id when only the session id is known. */
export function readBarItemForSession(
  sessionId: string,
  id: string,
): BarCard | null {
  const session = getSessionById(sessionId);
  if (!session) return null;
  const row = readRowByCardId(session.id, id);
  return row ? rowToCard(row) : null;
}

/** The newest card in one tab, or `null` when it is empty. */
export function latestBarItemFor(
  userId: string,
  field: BarField,
): BarCard | null {
  const session = resolveBarSession(userId, field);
  if (!session) return null;
  const row: DetailBarRow | undefined = readAllRootRows(session.id, field)[0];
  return row ? rowToCard(row) : null;
}

/** One page of a tab, roots with their ads, newest first. */
export function readBarPageFor(
  sessionId: string,
  field: BarField,
  options: {
    limit?: number;
    cursor?: string | null;
    parentId?: string | null;
    kind?: string | null;
  } = {},
): { items: BarCard[]; nextCursor: string | null } {
  if (options.parentId) {
    const parent = readRowByCardId(sessionId, options.parentId);
    if (!parent) return { items: [], nextCursor: null };
    const rows = readSubtree(sessionId, field, [parent]);
    return {
      items: assembleRows(rows, [parent], tabChildren(field)).slice(0, 1),
      nextCursor: null,
    };
  }
  return readAssembled(sessionId, field, {
    limit: options.limit ?? SNAPSHOT_ROOTS,
    cursor: options.cursor,
  });
}

/** First page of every tab the session owns. */
export function getDetailBarSnapshot(session: Session): DetailBarState {
  if (!session.slug) return {};
  const group: Record<string, BarCard[]> = {};
  for (const field of allBarFieldsOf(session.slug)) {
    // A tab's retained rows are bounded (≤200), so the shell gets them all.
    group[field] = readAssembled(session.id, field, {
      limit: tabRetention(field),
    }).items;
  }
  return {
    [resolveDetailBarType({ slug: session.slug })]: group,
  } as DetailBarState;
}

/** Every ad in the Campaigns tab, compact, for the health skill. */
export function readAdsForClassification(
  userId: string,
): Array<Record<string, unknown>> | null {
  const session = resolveBarSession(userId, "campaigns");
  if (!session) return null;
  const roots = readAllRootRows(session.id, "campaigns");
  const children = readChildRows(
    session.id,
    "campaigns",
    roots.map((row) => row.id),
  );

  return children.map((ad) => {
    const data = ad.data as Record<string, unknown>;
    return {
      campaignId: ad.parentId,
      id: ad.id,
      name: data.name,
      adsetId: data.adsetId,
      category: data.category,
      metrics: data.metrics,
      resultShare: data.resultShare,
      status: ad.status,
    };
  });
}

const AD_CATEGORIES = new Set([
  "winner",
  "scaler",
  "potential",
  "loser",
  "untested",
]);

/** The move a classified ad recommends; the card's primary button reads it. */
const ACTION_BY_CATEGORY: Record<string, string> = {
  winner: "Raise this ad set's budget by 20% and keep the creative.",
  scaler: "Duplicate this ad into a fresh audience.",
  potential: "Give this ad more delivery and re-check in 48 hours.",
  loser: "Pause this ad and move its budget to the winner.",
};

export interface AdClassification {
  id: string;
  category: string;
}

/**
 * Write the health skill's verdicts onto ad rows; chips follow the verdicts.
 */
export function classifyCampaignAds(
  userId: string,
  entries: readonly AdClassification[],
): { updated: number } | null {
  const session = resolveBarSession(userId, "campaigns");
  if (!session) return null;

  const roots = readAllRootRows(session.id, "campaigns");
  const children = readChildRows(
    session.id,
    "campaigns",
    roots.map((row) => row.id),
  );

  let updated = 0;
  const touched = new Set<string>();
  const writes: Array<{
    id: string;
    parentId: string | null;
    status: string | null;
    data: Record<string, unknown>;
    updatedAt?: string;
  }> = [];

  for (const ad of children) {
    const entry = entries.find((item) => item.id === ad.id);
    const category = entry?.category?.trim().toLowerCase();
    if (!category || !AD_CATEGORIES.has(category)) continue;

    const { action: _previous, ...rest } = ad.data as Record<string, unknown>;
    const fix = ACTION_BY_CATEGORY[category];
    writes.push({
      id: ad.id,
      parentId: ad.parentId,
      status: ad.status,
      data: {
        ...rest,
        category,
        ...(fix ? { action: { fix, status: ad.status ?? "pending" } } : {}),
      },
      updatedAt: ad.updatedAt,
    });
    updated += 1;
    if (ad.parentId) touched.add(ad.parentId);
  }

  if (writes.length === 0) return { updated };

  upsertRows(session.id, session.slug ?? "adManager", "campaigns", writes);

  // Chips are the ad categories counted, so they follow the verdicts.
  for (const parentId of touched) {
    const parent = readRowByCardId(session.id, parentId);
    if (!parent) continue;
    const ads = readChildRows(session.id, "campaigns", [parentId]);
    const chips: Record<string, number> = {};
    for (const ad of ads) {
      const data = ad.data as Record<string, unknown>;
      if (data.category === "winner") chips.winners = (chips.winners ?? 0) + 1;
      if (data.category === "scaler") chips.scalers = (chips.scalers ?? 0) + 1;
      if (data.category === "loser") chips.losers = (chips.losers ?? 0) + 1;
      if (data.category === "potential")
        chips.potential = (chips.potential ?? 0) + 1;
    }
    const { chips: _oldChips, ...parentRest } = parent.data as Record<
      string,
      unknown
    >;
    upsertRows(session.id, session.slug ?? "adManager", "campaigns", [
      {
        id: parentId,
        parentId: null,
        status: parent.status,
        data: {
          ...parentRest,
          ...(Object.keys(chips).length > 0 ? { chips } : {}),
        },
        updatedAt: parent.updatedAt,
      },
    ]);
  }

  publishField(session, "campaigns");
  return { updated };
}

/** Cursor of the last row of a page (kept for callers that build one). */
export function pageCursor(row: DetailBarRow): string {
  return formatCursor(row);
}
