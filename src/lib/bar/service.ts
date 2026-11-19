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
  ADS_PER_CAMPAIGN,
  allBarFieldsOf,
  barOwner,
  isBarField,
  SNAPSHOT_ROOTS,
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

/** Roots with their children attached, as the UI renders them. */
function assemble(
  field: BarField,
  roots: readonly DetailBarRow[],
  children: readonly DetailBarRow[],
): BarCard[] {
  const byParent = new Map<string, BarCard[]>();
  for (const child of children) {
    const parent = child.parentId;
    if (!parent) continue;
    const list = byParent.get(parent) ?? [];
    list.push(rowToCard(child, true));
    byParent.set(parent, list);
  }

  return roots.map((root) => {
    const card = rowToCard(root);
    if (field !== "campaigns") return card;
    const ads = byParent.get(root.id);
    return ads && ads.length > 0 ? { ...card, ads } : card;
  });
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
  const children =
    field === "campaigns"
      ? readChildRows(
          sessionId,
          field,
          page.rows.map((row) => row.id),
        )
      : [];
  return {
    items: assemble(field, page.rows, children),
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

/** Split one incoming card into its row and, for campaigns, its ad rows. */
function toRows(
  field: BarField,
  item: BarItemInput,
  nowId: string,
): {
  root: {
    id: string;
    parentId: null;
    status: string | null;
    data: Record<string, unknown>;
  };
  children: Array<{
    id: string;
    parentId: string;
    status: string | null;
    data: Record<string, unknown>;
  }>;
} {
  const { id, data, status, error } = item;
  const raw = { ...((data ?? {}) as Record<string, unknown>) };
  const children: Array<{
    id: string;
    parentId: string;
    status: string | null;
    data: Record<string, unknown>;
  }> = [];

  if (field === "campaigns" && Array.isArray(raw.ads)) {
    for (const value of raw.ads as Array<Record<string, unknown>>) {
      const adId = typeof value.id === "string" ? value.id : "";
      if (!adId) continue;
      const { id: _ignored, status: adStatus, error: _adError, ...ad } = value;
      const action =
        typeof ad.action === "object" && ad.action !== null
          ? (ad.action as Record<string, unknown>)
          : null;
      const statusValue =
        typeof adStatus === "string"
          ? adStatus
          : typeof action?.status === "string"
            ? action.status
            : null;
      children.push({
        id: adId,
        parentId: id,
        status: statusValue,
        data: ad,
      });
    }
    delete raw.ads;
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
    root: { id: id || nowId, parentId: null, status: cardStatus, data: rest },
    children,
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

  const roots: Array<{
    id: string;
    parentId: null;
    status: string | null;
    data: Record<string, unknown>;
  }> = [];
  const children: Array<{
    id: string;
    parentId: string;
    status: string | null;
    data: Record<string, unknown>;
  }> = [];

  for (const item of items) {
    const split = toRows(field, item, item.id);
    roots.push(split.root);
    children.push(...split.children);
  }

  const writtenChildren = upsertRows(session.id, slug, field, children);
  const writtenRoots = upsertRows(session.id, slug, field, roots);

  pruneRows(session.id, field, null, tabRetention(field));
  if (field === "campaigns") {
    for (const root of roots) {
      pruneRows(session.id, field, root.id, ADS_PER_CAMPAIGN);
    }
    pruneOrphanChildren(session.id, field);
  }

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
  if (field !== "campaigns") return rowToCard(row);
  const children = readChildRows(session.id, field, [id]);
  return assemble(field, [row], children)[0] ?? rowToCard(row);
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
    const children = readChildRows(sessionId, field, [options.parentId]);
    return {
      items: assemble(field, [parent], children).slice(0, 1),
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
