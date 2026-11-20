/**
 * Detail-bar contract: tabs are authored nested; every level is a flat,
 * addressable field path (`campaigns`, `campaigns.ads`, …).
 *
 * The nested config is the single source. Paths, parents and children are
 * derived from it; nothing is duplicated.
 *
 * @module @/lib/detail.bar/fields
 */

import type { DetailBarSlug } from "./types";

/**
 * One tab, at any depth. `children` is a map keyed by tab name, so the same
 * shape repeats forever: campaigns → ads → creatives → …
 */
export interface TabNode {
  readonly label: string;
  readonly retain: number;
  /** Child tabs keyed by name; absent means this is a leaf. */
  readonly children?: Readonly<Record<string, TabNode>>;
}

export const DETAIL_BAR_TABS = {
  adManager: {
    campaigns: {
      label: "Campaigns",
      retain: 25,
      children: { ads: { label: "Ads", retain: 10 } },
    },
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

export type BarOwner = keyof typeof DETAIL_BAR_TABS;

/** Every path in one tab tree, prefixed with its ancestors. */
type PathsOf<T, Prefix extends string = ""> = {
  [K in keyof T & string]:
    | `${Prefix}${K}`
    | (T[K] extends { children?: infer C }
        ? C extends Record<string, TabNode>
          ? PathsOf<C, `${Prefix}${K}.`>
          : never
        : never);
}[keyof T & string];

/** Deep path union: campaigns | campaigns.ads | alerts | … */
export type DetailBarField = {
  [O in BarOwner]: PathsOf<(typeof DETAIL_BAR_TABS)[O]>;
}[BarOwner];

function tabsOf(owner: BarOwner): Record<string, TabNode> {
  return DETAIL_BAR_TABS[owner] as unknown as Record<string, TabNode>;
}

/** Walk one field path through the nested config. */
function findNode(field: string): TabNode | undefined {
  const [root, ...rest] = field.split(".");
  if (!root) return undefined;

  for (const owner of Object.keys(DETAIL_BAR_TABS) as BarOwner[]) {
    const tabs = tabsOf(owner);
    const node = tabs[root];
    if (!node) continue;
    let current: TabNode | undefined = node;
    for (const segment of rest) {
      current = current?.children?.[segment];
    }
    return current;
  }
  return undefined;
}

/** Config of one level. */
export function tabNode(field: DetailBarField): TabNode {
  const node = findNode(field);
  if (!node) throw new Error(`Unknown bar field: ${field}`);
  return node;
}

/** Immediate parent path, or `null` for a root tab. */
export function tabParentPath(field: DetailBarField): DetailBarField | null {
  const segments = field.split(".");
  if (segments.length <= 1) return null;
  return segments.slice(0, -1).join(".") as DetailBarField;
}

/** The key a nested level attaches under, e.g. ads. */
export function tabKey(field: DetailBarField): string {
  return field.split(".").pop() ?? field;
}

/** Direct child levels of a tab, in config order. */
export function tabChildFields(field: DetailBarField): DetailBarField[] {
  const children = tabNode(field).children ?? {};
  return Object.keys(children).map(
    (key) => `${field}.${key}` as DetailBarField,
  );
}

/** The first child level a tab owns, if any. */
export function tabChildField(field: DetailBarField): DetailBarField | null {
  return tabChildFields(field)[0] ?? null;
}

/** Root-to-parent ancestry, excluding the tab itself. */
export function tabAncestors(field: DetailBarField): DetailBarField[] {
  const trail: DetailBarField[] = [];
  let parent = tabParentPath(field);
  while (parent) {
    trail.unshift(parent);
    parent = tabParentPath(parent);
  }
  return trail;
}

/** Root cards one tab keeps. */
export function tabRetention(field: DetailBarField): number {
  return tabNode(field).retain;
}

/** Every path of one tree, depth-first in config order. */
function pathsOf(
  nodes: Record<string, TabNode>,
  prefix: string,
  out: DetailBarField[],
): DetailBarField[] {
  for (const [key, node] of Object.entries(nodes)) {
    const path = (prefix ? `${prefix}.${key}` : key) as DetailBarField;
    out.push(path);
    if (node.children) pathsOf(node.children, path, out);
  }
  return out;
}

/** Every field path, in bar order. */
export function allDetailBarFields(): DetailBarField[] {
  return (Object.keys(DETAIL_BAR_TABS) as BarOwner[]).flatMap((owner) =>
    pathsOf(tabsOf(owner), "", []),
  );
}

/** Every field one bar owns, nested levels included. */
export function allDetailBarFieldsOf(slug: string): DetailBarField[] {
  if (!(slug in DETAIL_BAR_TABS)) return [];
  return pathsOf(tabsOf(slug as BarOwner), "", []);
}

/** Root tabs one bar owns. */
export function topDetailBarFieldsOf(slug: string): DetailBarField[] {
  if (!(slug in DETAIL_BAR_TABS)) return [];
  return Object.keys(tabsOf(slug as BarOwner)) as DetailBarField[];
}

/** Bar type that owns a field. */
export function barOwner(field: DetailBarField): BarOwner {
  const root = field.split(".")[0] ?? "";
  for (const owner of Object.keys(DETAIL_BAR_TABS) as BarOwner[]) {
    if (Object.hasOwn(tabsOf(owner), root)) return owner;
  }
  throw new Error(`Unknown bar field: ${field}`);
}

/** Whether an untrusted string names a field path. */
export function isDetailBarField(value: unknown): value is DetailBarField {
  return typeof value === "string" && findNode(value) !== undefined;
}

/** Every card's user-owned state, on every tab. */
export const BAR_STATUSES = [
  "pending",
  "completed",
  "ignored",
  "error",
  "archived",
] as const;
export type BarStatus = (typeof BAR_STATUSES)[number];
