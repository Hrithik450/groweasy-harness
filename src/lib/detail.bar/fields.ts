/**
 * Detail-bar contract, grouped by bar and recursive inside each tab.
 *
 * A bar owns tabs; a tab owns tabs. `items` is that recursive child map:
 *
 *   adManager
 *   ├─ campaigns → ad → creative
 *   ├─ alerts
 *   └─ suggestions
 *
 * Depth and per-level retention are derived from the nesting.
 *
 * @module @/lib/detail.bar/fields
 */

import type { DetailBarSlug } from "./types";

/** One tab: retention plus its own child tabs. */
export interface TabNode {
  /** Tab name shown in the bar. */
  readonly label: string;
  /** Rows kept at this level, per parent. */
  readonly retain: number;
  /** Named child levels; the key is the level's name. */
  readonly items?: { readonly [name: string]: TabNode };
}

export const BAR_TABS = {
  adManager: {
    campaigns: {
      label: "Campaigns",
      retain: 25,
      items: { ads: { label: "Ads", retain: 10 } },
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

/** Find the bar that owns a tab; the bars are few, so this is a scan. */
function locate(field: BarField): { owner: BarOwner; config: TabNode } {
  for (const owner of Object.keys(BAR_TABS) as BarOwner[]) {
    const tabs = BAR_TABS[owner] as Record<string, TabNode>;
    if (Object.hasOwn(tabs, field)) return { owner, config: tabs[field] };
  }
  throw new Error(`Unknown bar field: ${field}`);
}

/** Every tab id across every bar, in bar order. */
export function allBarFields(): BarField[] {
  return (Object.keys(BAR_TABS) as BarOwner[]).flatMap((owner) =>
    Object.keys(BAR_TABS[owner] as Record<string, TabNode>),
  ) as BarField[];
}

/** Root section of any tab path, e.g. campaigns.ads → campaigns. */
export function rootKind(kind: string): BarField {
  const root = kind.split(".")[0] ?? kind;
  if (!isBarField(root)) throw new Error(`Unknown tab kind: ${kind}`);
  return root;
}

/** Config for one tab. */
export function tabConfig(field: BarField): TabNode {
  return locate(field).config;
}

/** Resolve a tab path ("campaigns.ads.creatives") to its node. */
export function tabNodeAt(path: string): TabNode | undefined {
  const [root, ...rest] = path.split(".");
  if (!isBarField(root)) return undefined;
  let node: TabNode | undefined = tabConfig(root);
  for (const name of rest) node = node?.items?.[name];
  return node;
}

/** Tab name shown in the bar; derived from the name when unconfigured. */
export function tabLabel(path: string): string {
  const node = tabNodeAt(path);
  if (node) return node.label;
  const name = path.split(".").pop() ?? path;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Sub-tabs directly under one path, ready to render. */
export function childTabs(path: string): TabRef[] {
  return childTabPaths(path).map((key) => ({ key, label: tabLabel(key) }));
}

/** Top-level tabs of a bar, in config order. */
export function barTabs(owner: BarOwner): TabRef[] {
  const tabs = BAR_TABS[owner] as Record<string, TabNode>;
  return Object.keys(tabs).map((key) => ({ key, label: tabs[key].label }));
}

/** Sub-tab paths directly under one path, e.g. campaigns → [campaigns.ads]. */
export function childTabPaths(path: string): string[] {
  const node = tabNodeAt(path);
  return Object.keys(node?.items ?? {}).map((name) => `${path}.${name}`);
}

/** Deepest nested level below one tab (branch-aware). */
function nodeDepth(node: TabNode): number {
  const children = Object.values(node.items ?? {});
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map((child) => nodeDepth(child)));
}

/** Deepest legal `depth` for one tab. */
export function maxDepthFor(kind: BarField): number {
  return nodeDepth(tabConfig(kind));
}

/** Rows kept at one depth; deeper levels fall back to the deepest config. */
export function retainAtDepth(kind: BarField, depth: number): number {
  const collects: number[] = [];
  const collect = (node: TabNode, remaining: number): void => {
    if (remaining === 0) {
      collects.push(node.retain);
      return;
    }
    for (const child of Object.values(node.items ?? {})) {
      collect(child, remaining - 1);
    }
  };
  const root = tabConfig(kind);
  collect(root, depth);
  // Branch-aware: one depth may hold different budgets; keep the widest.
  return collects.length > 0 ? Math.max(...collects) : root.retain;
}

/** Rows a bar renders before the reader has to ask for older ones. */
export const BAR_PAGE_SIZE = 20;

/** Whether an untrusted string names a bar tab. */
export function isBarField(value: unknown): value is BarField {
  return (
    typeof value === "string" && allBarFields().includes(value as BarField)
  );
}

/** Bar type that owns a tab. */
export function barOwner(field: BarField): BarOwner {
  return locate(field).owner;
}

/** Root rows kept per tab; deeper levels use {@link retainAtDepth}. */
export function barRetention(field: BarField): number {
  return locate(field).config.retain;
}

/** A tab path plus the name it renders. */
export interface TabRef {
  key: string;
  label: string;
}

/** One stored card as the client and tools see it. */
export interface BarItem {
  /** Business id; stable and client-facing. */
  id: string;
  /** Tab path: campaigns, campaigns.ads, campaigns.ads.creatives. */
  kind: string;
  parentId: string | null;
  depth: number;
  /** User-owned state: pending, accepted, ignored, completed, error. */
  status?: string;
  /** Why the status changed. */
  error?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/** One page of a tab, newest first. */
export interface BarPage<T extends BarItem = BarItem> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
