/**
 * Client-safe tree helpers for bar rows.
 *
 * The wire carries flat, self-referencing rows; the UI wants nested cards.
 * These two functions convert in both directions without touching storage.
 *
 * @module @/lib/detail.bar/rows
 */

import { childTabPaths, type BarItem } from "./fields";

/** Names a row's child cards are attached under. */
function childKeys(row: BarItem): string[] {
  if (row.depth > 0) return ["children"];
  return childTabPaths(row.kind)
    .map((path) => path.slice(row.kind.length + 1))
    .filter((name) => name !== "" && !name.includes("."));
}

/** Flatten roots and their nested children into one row list. */
export function flattenBarItems(items: readonly unknown[]): BarItem[] {
  const rows: BarItem[] = [];

  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    const item = value as BarItem;
    const keys = childKeys(item);
    // Stored rows are flat: the nested arrays exist only on the wire.
    const row: BarItem = { ...item };
    for (const key of keys) delete row[key];
    rows.push(row);

    for (const key of keys) {
      const nested = item[key];
      if (Array.isArray(nested)) {
        for (const child of nested) visit(child);
      }
    }
  };

  for (const item of items) visit(item);
  return rows;
}

/** Attach children to their roots for the card shape. */
export function assembleBarItems(rows: readonly BarItem[]): unknown[] {
  const ids = new Set(rows.map((row) => row.id));
  const byParent = new Map<string, BarItem[]>();
  const roots: BarItem[] = [];

  for (const row of rows) {
    if (!row.parentId) {
      roots.push(row);
      continue;
    }
    // A child whose parent is absent is dangling, never a root card.
    if (!ids.has(row.parentId)) continue;
    const list = byParent.get(row.parentId) ?? [];
    list.push(row);
    byParent.set(row.parentId, list);
  }

  const build = (row: BarItem): unknown => {
    const kids = byParent.get(row.id);
    if (kids === undefined || kids.length === 0) return row;

    // A root's children keep their tab name (`ads`); deeper levels use `children`.
    const prefix = `${row.kind}.`;
    const out: Record<string, unknown> = { ...row };
    for (const kid of kids) {
      const name = kid.kind.startsWith(prefix)
        ? kid.kind.slice(prefix.length)
        : "";
      const key =
        row.depth === 0 && name !== "" && !name.includes(".")
          ? name
          : "children";
      const list = Array.isArray(out[key]) ? (out[key] as unknown[]) : [];
      list.push(build(kid));
      out[key] = list;
    }
    return out;
  };

  return roots.map((root) => build(root));
}
