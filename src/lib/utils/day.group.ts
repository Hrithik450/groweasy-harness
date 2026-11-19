/**
 * Day grouping for detail-bar rows: the app's wall-clock zone turns each
 * `createdAt` into a heading, so lists read as Today / Yesterday / a date.
 *
 * @module @/lib/utils/day.group
 */

import { APP_TIME_ZONE } from "@/lib/constants";

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: APP_TIME_ZONE,
});

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

function parse(iso: string | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date): string {
  return DAY_KEY.format(date);
}

/** Groups rows by their calendar day in the app zone, keeping input order. */
export function groupByDay<T>(
  items: T[],
  getCreatedAt: (item: T) => string | undefined,
): DayGroup<T>[] {
  const now = Date.now();
  const todayKey = dayKey(new Date(now));
  const yesterdayKey = dayKey(new Date(now - 86_400_000));

  const groups = new Map<string, DayGroup<T>>();

  for (const item of items) {
    const date = parse(getCreatedAt(item));
    const key = date ? dayKey(date) : "unknown";
    const label =
      key === todayKey
        ? "Today"
        : key === yesterdayKey
          ? "Yesterday"
          : date
            ? DAY_LABEL.format(date)
            : "Earlier";

    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, { key, label, items: [item] });
    }
  }

  return [...groups.values()];
}
