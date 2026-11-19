/**
 * Detail-bar contract: each bar owns a fixed list of tabs.
 *
 * Storage is one JSON document per tab, so this module only names tabs and
 * their labels.
 *
 * @module @/lib/detail.bar/fields
 */

import type { DetailBarSlug } from "./types";

/** One tab: just the name it renders. */
export interface TabNode {
  readonly label: string;
}

export const BAR_TABS = {
  adManager: {
    campaigns: { label: "Campaigns" },
    alerts: { label: "Alerts" },
    suggestions: { label: "Suggestions" },
  },
  adCreator: {
    ideas: { label: "Ideas" },
    creatives: { label: "Creatives" },
  },
  adStrategist: {
    reports: { label: "Daily reports" },
    competitorResearches: { label: "Competitor research" },
    campaignBriefs: { label: "Campaign brief" },
  },
} as const satisfies Record<DetailBarSlug, Record<string, TabNode>>;

/** Every card's user-owned state, on every tab. */
export const BAR_STATUSES = [
  "pending",
  "completed",
  "ignored",
  "error",
] as const;

export type BarStatus = (typeof BAR_STATUSES)[number];

export type BarOwner = keyof typeof BAR_TABS;

/** Every tab id across every bar. */
export type BarField = {
  [O in BarOwner]: keyof (typeof BAR_TABS)[O];
}[BarOwner];

/** Every tab id one bar owns, in config order. */
export function allBarFieldsOf(slug: string): BarField[] {
  if (!(slug in BAR_TABS)) return [];
  return Object.keys(
    BAR_TABS[slug as BarOwner] as Record<string, TabNode>,
  ) as BarField[];
}

/** Every tab id across every bar, in bar order. */
export function allBarFields(): BarField[] {
  return (Object.keys(BAR_TABS) as BarOwner[]).flatMap((owner) =>
    Object.keys(BAR_TABS[owner] as Record<string, TabNode>),
  ) as BarField[];
}

/** Bar type that owns a tab. */
export function barOwner(field: BarField): BarOwner {
  for (const owner of Object.keys(BAR_TABS) as BarOwner[]) {
    const tabs = BAR_TABS[owner] as Record<string, TabNode>;
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
  return value in BAR_TABS;
}
