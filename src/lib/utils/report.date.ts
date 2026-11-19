/**
 * Report dates, derived from one timestamp.
 *
 * A report stores when it was written; every label the UI shows is a
 * presentation of that instant in the app's wall-clock zone.
 *
 * @module @/lib/utils/report.date
 */

import { APP_TIME_ZONE } from "@/lib/constants";

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: APP_TIME_ZONE,
});
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: APP_TIME_ZONE,
});
const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: APP_TIME_ZONE,
});
const DAY_NUMBER_FORMAT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: APP_TIME_ZONE,
});
const ISO_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: APP_TIME_ZONE,
});

function parse(iso: string | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `YYYY-MM-DD` of an instant in the app's zone. */
export function reportIsoDate(iso: string | undefined): string | undefined {
  const date = parse(iso);
  return date ? ISO_FORMAT.format(date) : undefined;
}

/** Weekday, display date, and the split month/day a tile stacks. */
export function reportDateLabels(iso: string | undefined): {
  day: string;
  date: string;
  month: string;
  dayNumber: string;
} {
  const date = parse(iso);
  if (!date) return { day: "", date: "", month: "", dayNumber: "" };
  return {
    day: DAY_FORMAT.format(date),
    date: DATE_FORMAT.format(date),
    month: MONTH_FORMAT.format(date),
    dayNumber: DAY_NUMBER_FORMAT.format(date),
  };
}

/** Whether the report was written today, in the app's zone. */
export function isReportToday(iso: string | undefined): boolean {
  const day = reportIsoDate(iso);
  return day !== undefined && day === reportIsoDate(new Date().toISOString());
}
