/**
 * Detail-bar service: one JSON document per tab.
 *
 * A tool hands over cards; the stored document is exactly what the UI renders.
 * Campaigns carry their `ads` array inside the card, so no tree, cursors or
 * assembly live here.
 *
 * @module @/lib/bar/service
 */

import type { Session } from "@/lib/db";
import {
  allBarFieldsOf,
  barOwner,
  isBarField,
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
import { readBarDoc, writeBarDoc, type BarCard } from "./docs.repo";

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

/** Merge one card's columns into the document shape. */
function toCard(field: BarField, item: BarItemInput): BarCard {
  const { id, data, status, error } = item;
  const card: BarCard = { ...((data ?? {}) as Record<string, unknown>), id };
  if (status !== undefined && status !== null) card.status = status;
  if (error !== undefined && error !== null) {
    card.error = error;
    // Alerts show the reason as a note.
    if (field === "alerts") card.note = error;
  }
  return card;
}

function publishField(
  session: Session,
  field: BarField,
  items: BarCard[],
): void {
  publish(sessionKey(session.id), {
    event: SESSION_DETAIL_BAR_EVENT,
    data: { type: "field", sessionId: session.id, field, items },
  });
}

/**
 * Write cards into the tab that owns them.
 *
 * @returns the written cards, or `null` when the owning session is missing.
 */
export function saveBarItems(
  userId: string,
  field: BarField,
  items: readonly BarItemInput[],
  options: { replace?: boolean } = {},
): { session: Session; items: BarCard[] } | null {
  const session = resolveBarSession(userId, field);
  if (!session) return null;

  const replace = options.replace === true;
  const byId = new Map<string, BarCard>();
  if (!replace) {
    for (const card of readBarDoc(session.id, field) ?? []) {
      byId.set(String(card.id), card);
    }
  }

  const written = items.map((item) => toCard(field, item));
  for (const card of written) byId.set(card.id, card);

  const data = Array.from(byId.values());
  writeBarDoc(session.id, field, data);
  publishField(session, field, data);

  return { session, items: written };
}

/** Find a card by id, including an ad inside a campaign's `ads` array. */
function findCard(
  data: readonly BarCard[],
  id: string,
): { card: BarCard; parent?: BarCard } | null {
  for (const card of data) {
    if (card.id === id) return { card };
    const ads = Array.isArray(card.ads) ? (card.ads as BarCard[]) : [];
    const ad = ads.find((row) => row?.id === id);
    if (ad) return { card: ad, parent: card };
  }
  return null;
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
 * @returns the updated card, or `null` when the card does not exist.
 */
export function patchBarItem(
  session: Session,
  id: string,
  patch: Record<string, unknown>,
  field?: BarField,
): BarCard | null {
  const owned = userOwnedPatch(patch);
  if (Object.keys(owned).length === 0) return null;

  if (!session.slug) return null;
  const fields = field ? [field] : allBarFieldsOf(session.slug);
  for (const current of fields) {
    const data = readBarDoc(session.id, current);
    if (!data) continue;

    const hit = findCard(data, id);
    if (!hit) continue;

    const next: BarCard = { ...hit.card, ...owned };
    if (current === "alerts" && typeof owned.error === "string") {
      next.note = owned.error;
    }

    const nextData = hit.parent
      ? data.map((card) =>
          card.id === hit.parent!.id
            ? {
                ...card,
                ads: (card.ads as BarCard[]).map((ad) =>
                  ad.id === id ? next : ad,
                ),
              }
            : card,
        )
      : data.map((card) => (card.id === id ? next : card));

    writeBarDoc(session.id, current, nextData);
    publishField(session, current, nextData);
    return next;
  }

  return null;
}

/** Read one card by id inside one tab. */
export function readBarItemFor(
  userId: string,
  field: BarField,
  id: string,
): BarCard | null {
  const session = resolveBarSession(userId, field);
  if (!session) return null;
  return findCard(readBarDoc(session.id, field) ?? [], id)?.card ?? null;
}

/** Read one card by id when only the session id is known. */
export function readBarItemForSession(
  sessionId: string,
  id: string,
): BarCard | null {
  const session = getSessionById(sessionId);
  if (!session?.slug) return null;
  for (const field of allBarFieldsOf(session.slug)) {
    const hit = findCard(readBarDoc(session.id, field) ?? [], id);
    if (hit) return hit.card;
  }
  return null;
}

/** The newest card in one tab, or `null` when it is empty. */
export function latestBarItemFor(
  userId: string,
  field: BarField,
): BarCard | null {
  const session = resolveBarSession(userId, field);
  if (!session) return null;
  const data = readBarDoc(session.id, field) ?? [];
  return data[data.length - 1] ?? null;
}

/** One tab's cards; page params are kept for older callers. */
export function readBarPageFor(
  sessionId: string,
  field: BarField,
  _options: {
    limit?: number;
    cursor?: string | null;
    parentId?: string | null;
    kind?: string | null;
  } = {},
): { items: BarCard[]; nextCursor: string | null; hasMore: boolean } {
  return {
    items: readBarDoc(sessionId, field) ?? [],
    nextCursor: null,
    hasMore: false,
  };
}

/** Every tab the session owns, as the client renders it. */
export function readBarSnapshot(session: Session): DetailBarState {
  if (!session.slug) return {};
  const group: Record<string, BarCard[]> = {};
  for (const field of allBarFieldsOf(session.slug)) {
    group[field] = readBarDoc(session.id, field) ?? [];
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

  const campaigns = readBarDoc(session.id, "campaigns") ?? [];
  return campaigns.flatMap((campaign) =>
    (Array.isArray(campaign.ads) ? (campaign.ads as BarCard[]) : []).map(
      (ad) => ({
        campaignId: campaign.id,
        id: ad.id,
        name: ad.name,
        adsetId: ad.adsetId,
        category: ad.category,
        metrics: ad.metrics,
        resultShare: ad.resultShare,
        status: ad.status,
      }),
    ),
  );
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
 * Write the health skill's verdicts onto the campaigns document.
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

  const raw = readBarDoc(session.id, "campaigns");
  if (!raw) return null;

  let updated = 0;
  const touched = new Set<string>();

  const data = raw.map((campaign) => {
    if (!Array.isArray(campaign.ads)) return campaign;
    let changed = false;
    const ads = (campaign.ads as BarCard[]).map((ad) => {
      const entry = entries.find((item) => item.id === ad.id);
      const category = entry?.category?.trim().toLowerCase();
      if (!category || !AD_CATEGORIES.has(category)) return ad;

      const { action: _previous, ...rest } = ad;
      const fix = ACTION_BY_CATEGORY[category];
      const next: BarCard = {
        ...rest,
        category,
        ...(fix ? { action: { fix, status: ad.status ?? "pending" } } : {}),
      };
      updated += 1;
      changed = true;
      touched.add(String(campaign.id));
      return next;
    });
    if (!changed) return campaign;

    const chips: Record<string, number> = {};
    for (const ad of ads) {
      if (ad.category === "winner") chips.winners = (chips.winners ?? 0) + 1;
      if (ad.category === "scaler") chips.scalers = (chips.scalers ?? 0) + 1;
      if (ad.category === "loser") chips.losers = (chips.losers ?? 0) + 1;
      if (ad.category === "potential")
        chips.potential = (chips.potential ?? 0) + 1;
    }
    const { chips: _oldChips, ...campaignRest } = campaign;
    return {
      ...campaignRest,
      ads,
      ...(Object.keys(chips).length > 0 ? { chips } : {}),
    } as BarCard;
  });

  if (touched.size === 0) return { updated };

  writeBarDoc(session.id, "campaigns", data);
  publishField(session, "campaigns", data);
  return { updated };
}
