/**
 * Detail-bar read/write service.
 *
 * Tools and routes name a tab, never a session: the owner slug decides which
 * bar the write lands in. A bar is created lazily on first use.
 *
 * @module @/lib/bar/service
 */

import type { Session } from "@/lib/db";
import {
  allBarFields,
  BAR_PAGE_SIZE,
  BAR_STATUSES,
  childTabPaths,
  rootKind,
  barOwner,
  type BarField,
  type BarItem,
  type BarPage,
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
  mergeBarData,
  readBarChildren,
  readBarChildrenPage,
  readBarItem,
  readBarPage,
  readStoredBarData,
  upsertBarItems,
  type BarItemInput,
} from "./items.repo";

export { BAR_PAGE_SIZE };

/** Resolve the session that owns a tab for one user. */
export function resolveBarSession(
  userId: string,
  field: BarField,
): Session | undefined {
  return getSessionByUserIdAndSlug(userId, barOwner(field));
}

/** One item split into its root plus every nested child, grouped by kind. */
interface SplitItem {
  root: BarItemInput;
  children: Array<{ kind: string; item: BarItemInput }>;
}

/**
 * Split a card into its root and child cards, driven by the tab tree.
 *
 * A child array in the data is named after the child tab (`ads`, `creatives`,
 * …); those rows are written under `<kind>.<name>`.
 */
function splitNested(
  kind: string,
  input: BarItemInput,
  depth = 0,
): SplitItem {
  const data = { ...(input.data as Record<string, unknown>) };
  const children: Array<{ kind: string; item: BarItemInput }> = [];

  for (const childKind of childTabPaths(kind)) {
    const name = childKind.slice(kind.length + 1);
    const raw = data[name];
    if (!Array.isArray(raw)) continue;
    delete data[name];

    for (const child of raw) {
      if (typeof child !== "object" || child === null) continue;
      const record = child as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      if (!id) continue;

      // A user-owned status lives in its own column, whether it sits on the
      // child or inside its `action`.
      const {
        id: _ignored,
        status: ownStatus,
        error: ownError,
        ...rest
      } = record;
      let status: string | null =
        typeof ownStatus === "string" ? ownStatus : "pending";
      let error: string | null =
        typeof ownError === "string" ? ownError : null;
      let childData = rest;
      const action =
        typeof rest.action === "object" && rest.action !== null
          ? (rest.action as Record<string, unknown>)
          : null;
      if (action !== null) {
        const {
          status: actionStatus,
          error: actionError,
          ...actionRest
        } = action;
        if (typeof actionStatus === "string") status = actionStatus;
        if (typeof actionError === "string") error = actionError;
        childData = { ...rest, action: actionRest };
      }

      const nested = splitNested(
        childKind,
        {
          id,
          parentId: input.id,
          depth: depth + 1,
          status,
          error,
          data: childData,
        },
        depth + 1,
      );
      children.push({ kind: childKind, item: nested.root });
      children.push(...nested.children);
    }
  }

  return { root: { ...input, depth, data }, children };
}

/**
 * Write entries into the tab that owns them, regardless of which session the
 * caller is chatting in.
 *
 * @returns the written rows, or `null` when the owning session is missing.
 */
export function saveBarItems(
  userId: string,
  field: BarField,
  items: readonly BarItemInput[],
  options: { replace?: boolean } = {},
): { session: Session; items: BarItem[] } | null {
  const session = resolveBarSession(userId, field);
  if (!session) return null;

  // Field first, then each nested kind; parents must exist before children.
  const levels = new Map<string, BarItemInput[]>([[field, []]]);
  const roots = levels.get(field)!;

  for (const item of items) {
    const split = splitNested(field, item);
    roots.push(split.root);
    for (const child of split.children) {
      const rows = levels.get(child.kind) ?? [];
      rows.push(child.item);
      levels.set(child.kind, rows);
    }
  }

  let written: BarItem[] = [];
  for (const [kind, rows] of levels) {
    const out = upsertBarItems(
      session.id,
      kind,
      rows,
      kind === field ? options : {},
    );
    if (kind === field) written = out;
  }

  publishBarField(session, field);
  return { session, items: written };
}

/** Push one row to viewers of its session; the client assembles the tree. */
function publishBarItem(session: Session, field: BarField, row: BarItem): void {
  publish(sessionKey(session.id), {
    event: SESSION_DETAIL_BAR_EVENT,
    data: { type: "row", sessionId: session.id, field, row },
  });
}

/** One page per level: roots plus the first page of each parent's children. */
function readFieldRows(
  sessionId: string,
  field: BarField,
): {
  rows: BarItem[];
  cursors: Record<string, { cursor: string | null; hasMore: boolean }>;
} {
  const page = readBarPage(sessionId, field, { limit: BAR_PAGE_SIZE });
  const rows: BarItem[] = [...page.items];
  const cursors: Record<string, { cursor: string | null; hasMore: boolean }> =
    {};

  // DFS over the tab tree: every level asks its own tab path.
  const walk = (kind: string, parents: readonly string[], level: number): void => {
    for (const childKind of childTabPaths(kind)) {
      const collected: BarItem[] = [];
      for (const parentId of parents) {
        const childPage = readBarChildrenPage(sessionId, parentId, {
          limit: BAR_PAGE_SIZE,
          kind: childKind,
        });
        collected.push(...childPage.items);
        if (level === 1) {
          cursors[parentId] = {
            cursor: childPage.nextCursor,
            hasMore: childPage.hasMore,
          };
        }
      }
      rows.push(...collected);
      walk(
        childKind,
        collected.map((child) => child.id),
        level + 1,
      );
    }
  };
  walk(
    field,
    page.items.map((item) => item.id),
    1,
  );

  return { rows, cursors };
}

/** Push a field's first page as flat rows. */
function publishBarField(session: Session, field: BarField): void {
  const page = readBarPage(session.id, field, { limit: BAR_PAGE_SIZE });
  const { rows, cursors } = readFieldRows(session.id, field);

  publish(sessionKey(session.id), {
    event: SESSION_DETAIL_BAR_EVENT,
    data: {
      type: "page",
      sessionId: session.id,
      field,
      rows,
      // Per-level cursors: the roots page and each parent's children page.
      cursor: page.nextCursor,
      hasMore: page.hasMore,
      cursors,
    },
  });
}

/**
 * Keep only the fields a user owns, so a stale client cannot rewrite analysis.
 * Every tab shares one status vocabulary; `error` is the reason for `error`.
 */
function userOwnedPatch(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set<string>(BAR_STATUSES);
  const owned: Record<string, unknown> = {};

  if (typeof patch.status === "string" && allowed.has(patch.status)) {
    owned.status = patch.status;
  }
  if (typeof patch.error === "string") owned.error = patch.error;
  return owned;
}

/**
 * Merge a user patch into one stored row.
 *
 * Only the fields the user owns change; a concurrent agent write to other
 * fields stands.
 *
 * @returns the updated row, or `null` when the row does not exist.
 */
export function patchBarItem(
  session: Session,
  id: string,
  patch: Record<string, unknown>,
): BarItem | null {
  const row = readBarItem(session.id, id);
  if (!row) return null;

  const owned = userOwnedPatch(patch);
  if (Object.keys(owned).length === 0) return row;

  const stored = readStoredBarData(session.id, id) ?? {};
  const dataPatch = Object.fromEntries(
    Object.entries(owned).filter(
      ([key]) => key !== "status" && key !== "error",
    ),
  );

  const written = upsertBarItems(session.id, row.kind, [
    {
      id,
      parentId: row.parentId,
      depth: row.depth,
      status: (owned.status as string | undefined) ?? row.status ?? null,
      error: (owned.error as string | undefined) ?? row.error ?? null,
      data:
        Object.keys(dataPatch).length > 0
          ? mergeBarData(stored, dataPatch)
          : stored,
    },
  ]);
  const item = written[0] ?? null;
  // One row changed: send that row; the client slots it into its parent.
  if (item !== null) publishBarItem(session, rootKind(item.kind), item);
  return item;
}

/** Read one card by id inside its tab, children attached, for a user. */
export function readBarItemFor(
  userId: string,
  kind: BarField,
  id: string,
): BarItem | null {
  const session = resolveBarSession(userId, kind);
  if (!session) return null;
  return readOne(session.id, id);
}

/** Read one card by id when only the session id is known. */
export function readBarItemForSession(
  sessionId: string,
  id: string,
): BarItem | null {
  const session = getSessionById(sessionId);
  if (!session) return null;
  return readOne(session.id, id);
}

function readOne(sessionId: string, id: string): BarItem | null {
  const row = readBarItem(sessionId, id);
  if (!row) return null;
  return assembleRoots(sessionId, [row])[0] ?? row;
}

/** The newest root card in one tab, or `null` when it is empty. */
export function latestBarItemFor(
  userId: string,
  kind: BarField,
): BarItem | null {
  const session = resolveBarSession(userId, kind);
  if (!session) return null;
  const page = readBarPage(session.id, kind, { limit: 1 });
  return page.items[0] ?? null;
}

/** Map column state back onto the card keys the UI reads. */
function toWire(item: BarItem): BarItem {
  // Alerts show the status reason as `note`.
  if (item.kind === "alerts" && item.error !== undefined) {
    return { ...item, note: item.error };
  }
  return item;
}

/** Attach one-level children to their parents for the wire shape. */
function assembleRoots(sessionId: string, roots: BarItem[]): BarItem[] {
  if (roots.length === 0) return roots;

  // Walk every descendant once; the tab tree decides how deep it goes.
  const all: BarItem[] = [...roots];
  let frontier = roots.map((root) => root.id);
  while (frontier.length > 0) {
    const children = readBarChildren(sessionId, frontier);
    if (children.length === 0) break;
    all.push(...children);
    frontier = children.map((child) => child.id);
  }
  if (all.length === roots.length) return roots.map((root) => toWire(root));

  const byParent = new Map<string, BarItem[]>();
  for (const row of all) {
    const parent = row.parentId;
    if (!parent) continue;
    const list = byParent.get(parent) ?? [];
    list.push(row);
    byParent.set(parent, list);
  }

  const build = (row: BarItem): BarItem => {
    const kids = byParent.get(row.id);
    if (!kids || kids.length === 0) return toWire(row);

    // A root's children keep their tab name (`ads`); deeper levels use `children`.
    const prefix = `${row.kind}.`;
    const out: Record<string, unknown> = { ...toWire(row) };
    for (const kid of kids) {
      const name = kid.kind.startsWith(prefix)
        ? kid.kind.slice(prefix.length)
        : "";
      const key =
        row.depth === 0 && name !== "" && !name.includes(".") ? name : "children";
      const list = Array.isArray(out[key]) ? (out[key] as BarItem[]) : [];
      // The action's status lives in its own column.
      const action =
        typeof kid.action === "object" && kid.action !== null
          ? {
              ...(kid.action as Record<string, unknown>),
              status: kid.status ?? "pending",
            }
          : kid.action;
      list.push(build({ ...kid, action }) as BarItem);
      out[key] = list;
    }
    return out as BarItem;
  };

  return roots.map(build);
}

/** Read one page of a tab by its owning session id. */
export function readBarPageFor(
  sessionId: string,
  field: BarField,
  options: {
    limit?: number;
    cursor?: string | null;
    /** Children of this parent instead of the field's roots. */
    parentId?: string | null;
    /** Card kind path for a sub-tab; defaults to the field. */
    kind?: string | null;
  } = {},
): BarPage {
  const session = getSessionById(sessionId);
  if (!session) {
    return { items: [], nextCursor: null, hasMore: false };
  }
  const limit = options.limit ?? BAR_PAGE_SIZE;
  const kind = options.kind ?? field;
  if (options.parentId) {
    return readBarChildrenPage(session.id, options.parentId, {
      limit,
      kind,
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    });
  }
  const page = readBarPage(session.id, kind, {
    limit,
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
  });
  return { ...page, items: assembleRoots(session.id, page.items) };
}

/** The first page of every tab one bar owns. */
export function readBarSnapshot(session: Session): DetailBarState {
  const group: Record<string, unknown> = {};

  for (const field of allBarFields()) {
    if (barOwner(field) !== session.slug) continue;
    const page = readBarPage(session.id, field, { limit: BAR_PAGE_SIZE });
    group[field] = assembleRoots(session.id, page.items);
  }

  return {
    [resolveDetailBarType({ slug: session.slug })]: group,
  } as DetailBarState;
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

/** Every ad in the Campaigns tab, compact, for the health skill. */
export function readAdsForClassification(
  userId: string,
): Array<Record<string, unknown>> | null {
  const session = resolveBarSession(userId, "campaigns");
  if (!session) return null;

  const roots = readBarPage(session.id, "campaigns", {
    limit: BAR_PAGE_SIZE,
  }).items;
  const ads = readBarChildren(
    session.id,
    roots.map((root) => root.id),
  );

  return ads.map((ad) => ({
    campaignId: ad.parentId,
    id: ad.id,
    name: ad.name,
    adsetId: ad.adsetId,
    category: ad.category,
    metrics: ad.metrics,
    resultShare: ad.resultShare,
    status: ad.status,
  }));
}

/**
 * Write the health skill's verdicts onto ad rows.
 *
 * Only the category (and its derived move) changes; the synced metrics stand.
 * Each touched campaign's chips are recounted from its ads.
 */
export function classifyCampaignAds(
  userId: string,
  entries: readonly AdClassification[],
): { updated: number } | null {
  const session = resolveBarSession(userId, "campaigns");
  if (!session) return null;

  const parents = new Set<string>();
  let updated = 0;

  for (const entry of entries) {
    const category = entry.category.trim().toLowerCase();
    if (!AD_CATEGORIES.has(category)) continue;

    const row = readBarItem(session.id, entry.id);
    if (!row || row.kind !== "campaigns.ads") continue;

    const stored = readStoredBarData(session.id, entry.id) ?? {};
    const { action: _previous, ...rest } = stored as Record<string, unknown>;
    const fix = ACTION_BY_CATEGORY[category];
    const data = {
      ...rest,
      category,
      ...(fix
        ? { action: { fix, status: row.status ?? "pending" } }
        : {}),
    };

    const [written] = upsertBarItems(session.id, row.kind, [
      {
        id: entry.id,
        parentId: row.parentId,
        depth: row.depth,
        status: row.status,
        error: row.error,
        data,
      },
    ]);
    if (written) {
      updated += 1;
      publishBarItem(session, "campaigns", written);
      if (row.parentId) parents.add(row.parentId);
    }
  }

  // Chips are the ad categories counted, so they follow the verdicts.
  for (const parentId of parents) {
    const parent = readBarItem(session.id, parentId);
    if (!parent) continue;

    const counts: Record<string, number> = {};
    for (const ad of readBarChildren(session.id, [parentId])) {
      const category = String(ad.category ?? "");
      if (category === "winner") counts.winners = (counts.winners ?? 0) + 1;
      if (category === "scaler") counts.scalers = (counts.scalers ?? 0) + 1;
      if (category === "loser") counts.losers = (counts.losers ?? 0) + 1;
      if (category === "potential")
        counts.potential = (counts.potential ?? 0) + 1;
    }

    const parentStored = readStoredBarData(session.id, parentId) ?? {};
    const { chips: _oldChips, ...parentRest } = parentStored as Record<
      string,
      unknown
    >;
    const [campaignRow] = upsertBarItems(session.id, parent.kind, [
      {
        id: parentId,
        parentId: null,
        depth: 0,
        status: parent.status,
        error: parent.error,
        data: {
          ...parentRest,
          ...(Object.keys(counts).length > 0 ? { chips: counts } : {}),
        },
      },
    ]);
    if (campaignRow) publishBarItem(session, "campaigns", campaignRow);
  }

  return { updated };
}
