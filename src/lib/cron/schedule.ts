import type { ScheduleTiming } from "@/lib/db";
import { APP_TIME_ZONE } from "@/lib/constants";

/** Next instant a job timing fires, or null when it cannot be computed. */
export function nextOccurrenceForTiming(
  timing: ScheduleTiming,
  fromDate = new Date(),
): Date | null {
  if (timing.kind === "at") {
    const at = new Date(timing.at);
    return Number.isNaN(at.getTime()) ? null : at;
  }
  return computeNextOccurrence(timing.expression, fromDate, APP_TIME_ZONE);
}

/** Wall-clock date/time parts in one IANA zone. */
interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Read one instant as wall-clock parts in `timeZone`. */
function partsInZone(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // `hour` is "24" at midnight in some engines; normalise it.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** How far `timeZone` is ahead of UTC at one instant, in milliseconds. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const wall = partsInZone(date, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    date.getUTCSeconds(),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Turn a wall-clock time in one zone into the absolute instant it names.
 *
 * The offset is read twice: a first guess can land on the other side of a DST
 * transition, where the offset differs from the one used to build it.
 */
function zonedWallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = zoneOffsetMs(new Date(guessMs), timeZone);
  let instant = new Date(guessMs - firstOffset);
  const settledOffset = zoneOffsetMs(instant, timeZone);
  if (settledOffset !== firstOffset) {
    instant = new Date(guessMs - settledOffset);
  }
  return instant;
}

/**
 * Computes the next scheduled execution date for standard 5-part cron syntax.
 * Supports:
 * - "0 9 * * *" (daily at specific hour:minute)
 * - "* /N * * * *" (every N minutes)
 * - "0 * /N * * *" (every N hours)
 */
export function computeNextOccurrence(
  schedule: string,
  fromDate = new Date(),
  timeZone?: string,
): Date {
  const [minPart, hourPart] = (schedule || "").trim().split(/\s+/);

  // Every N minutes: "*/N * * * *"
  if (minPart?.startsWith("*/") && hourPart === "*") {
    const step = parseInt(minPart.slice(2), 10) || 15;
    const next = new Date(fromDate.getTime() + step * 60 * 1000);
    next.setSeconds(0, 0);
    return next;
  }

  // Every hour at a fixed minute: "M * * * *". The minute is wall-clock, and
  // a zone like Asia/Kolkata is half an hour off UTC, so it must be resolved
  // in the zone rather than by setting minutes on the instant.
  const hourlyMinute = minPart?.startsWith("*") ? NaN : parseInt(minPart, 10);
  if (!isNaN(hourlyMinute) && hourPart === "*") {
    if (!timeZone) {
      const next = new Date(fromDate);
      next.setMinutes(hourlyMinute, 0, 0);
      if (next.getTime() <= fromDate.getTime()) {
        next.setHours(next.getHours() + 1);
      }
      return next;
    }

    const now = partsInZone(fromDate, timeZone);
    let candidate = zonedWallClockToInstant(
      now.year,
      now.month,
      now.day,
      now.hour,
      hourlyMinute,
      timeZone,
    );
    if (candidate.getTime() <= fromDate.getTime()) {
      const following = partsInZone(
        new Date(candidate.getTime() + 60 * 60 * 1000),
        timeZone,
      );
      candidate = zonedWallClockToInstant(
        following.year,
        following.month,
        following.day,
        following.hour,
        hourlyMinute,
        timeZone,
      );
    }
    return candidate;
  }

  // Every N hours: "0 */N * * *"
  if (!minPart?.startsWith("*") && hourPart?.startsWith("*/")) {
    const next = new Date(fromDate);
    next.setMinutes(parseInt(minPart, 10) || 0, 0, 0);
    next.setHours(next.getHours() + (parseInt(hourPart.slice(2), 10) || 1));
    return next;
  }

  // Specific wall-clock time: e.g. "0 9 * * *". Without a zone this is the
  // server's own clock; with one it is that zone's clock, which is what the
  // stored expression means.
  const min = parseInt(minPart, 10);
  const hour = parseInt(hourPart, 10);
  if (!isNaN(min) && !isNaN(hour)) {
    if (!timeZone) {
      const next = new Date(fromDate);
      next.setHours(hour, min, 0, 0);
      if (next.getTime() <= fromDate.getTime()) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    const today = partsInZone(fromDate, timeZone);
    let candidate = zonedWallClockToInstant(
      today.year,
      today.month,
      today.day,
      hour,
      min,
      timeZone,
    );
    if (candidate.getTime() <= fromDate.getTime()) {
      const tomorrow = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
      const nextDay = partsInZone(tomorrow, timeZone);
      candidate = zonedWallClockToInstant(
        nextDay.year,
        nextDay.month,
        nextDay.day,
        hour,
        min,
        timeZone,
      );
    }
    return candidate;
  }

  const fallback = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
  fallback.setSeconds(0, 0);
  return fallback;
}
