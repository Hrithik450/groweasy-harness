/**
 * Detail-bar contract: each bar owns a fixed list of tabs.
 *
 * Storage is one JSON document per tab, so this module only names tabs and
 * their labels.
 *
 * @module @/lib/detail.bar/fields
 */

import type { DetailBarSlug } from "./types";

/** One tab: its label and the root cards it keeps. */
export interface TabNode {
  readonly label: string;
  readonly retain: number;
}

export const DETAIL_BAR_TABS = {
  adManager: {
    campaigns: { label: "Campaigns", retain: 25 },
    alerts: { label: "Alerts", retain: 200 },
    suggestions: { label: "Suggestions", retain: 100 },
  },
  adCreator: {
    ideas: { label: "Ideas", retain: 120 },
    creatives: { label: "Creatives", retain: 120 },
  },
  adStrategist: {
    reports: { label: "Daily reports", retain: 60 },
    competitorResearches: { label: "Competitor research", retain: 60 },
    campaignBriefs: { label: "Campaign brief", retain: 100 },
  },
} as const satisfies Record<DetailBarSlug, Record<string, TabNode>>;

/** Root cards one tab keeps. */
export function tabRetention(field: BarField): number {
  for (const owner of Object.keys(DETAIL_BAR_TABS) as BarOwner[]) {
    const tabs = DETAIL_BAR_TABS[owner] as Record<string, TabNode>;
    if (Object.hasOwn(tabs, field)) return tabs[field].retain;
  }
  return 25;
}

/** Ads kept per campaign. */
export const ADS_PER_CAMPAIGN = 10;

/** Root cards the server renders before older pages are requested. */
export const SNAPSHOT_ROOTS = 20;

/** Every card's user-owned state, on every tab. */
export const BAR_STATUSES = [
  "pending",
  "completed",
  "ignored",
  "error",
] as const;

export type BarStatus = (typeof BAR_STATUSES)[number];

export type BarOwner = keyof typeof DETAIL_BAR_TABS;

/** Every tab id across every bar. */
export type BarField = {
  [O in BarOwner]: keyof (typeof DETAIL_BAR_TABS)[O];
}[BarOwner];

/** Every tab id one bar owns, in config order. */
export function allBarFieldsOf(slug: string): BarField[] {
  if (!(slug in DETAIL_BAR_TABS)) return [];
  return Object.keys(
    DETAIL_BAR_TABS[slug as BarOwner] as Record<string, TabNode>,
  ) as BarField[];
}

/** Every tab id across every bar, in bar order. */
export function allBarFields(): BarField[] {
  return (Object.keys(DETAIL_BAR_TABS) as BarOwner[]).flatMap((owner) =>
    Object.keys(DETAIL_BAR_TABS[owner] as Record<string, TabNode>),
  ) as BarField[];
}

/** Bar type that owns a tab. */
export function barOwner(field: BarField): BarOwner {
  for (const owner of Object.keys(DETAIL_BAR_TABS) as BarOwner[]) {
    const tabs = DETAIL_BAR_TABS[owner] as Record<string, TabNode>;
    if (Object.hasOwn(tabs, field)) return owner;
  }
  throw new Error(`Unknown bar field: ${field}`);
}

/** Whether an untrusted string names a bar tab. */
export function isBarField(value: unknown): value is BarField {
  return (
    typeof value === "string" && allBarFields().includes(value as BarField)
  );
}

/** Whether a string names a bar (session slug). */
export function isBarOwner(value: string): value is BarOwner {
  return value in DETAIL_BAR_TABS;
}
