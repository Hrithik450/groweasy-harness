/**
 * Next-occurrence arithmetic for the host's five-part cron dialect.
 *
 * Moved verbatim from the application's `@/lib/cron/schedule` so every caller
 * of that module keeps the same targets. The dialect stays deliberately small:
 *
 * - `0 9 * * *` — daily at a wall-clock hour:minute in {@link DEFAULT_TIME_ZONE};
 * - `*&#47;N * * * *` — every N minutes from the supplied instant;
 * - `0 *&#47;N * * *` — every N hours with the minute fixed;
 * - anything else — a one-day fallback at second zero.
 *
 * Timezone conversion is only applied to the fixed daily form; the interval
 * forms advance wall-clock time directly, exactly as the application did.
 *
 * @module @openai-harness/schedule
 */

/** Zone applied to fixed daily expressions when the caller names none. */
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/** Fixed offset of {@link DEFAULT_TIME_ZONE} appended to the daily target. */
const DEFAULT_UTC_OFFSET = "+05:30";

/** One day in milliseconds, used by the daily roll-over and the fallback. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Computes the next scheduled execution date for standard five-part cron
 * syntax. Timezone defaults to `Asia/Kolkata` (IST, UTC+5:30).
 *
 * @param schedule - five-field cron expression; malformed input takes the fallback.
 * @param fromDate - instant the search starts strictly after.
 * @param timeZone - zone used only by the fixed daily form.
 * @returns the strictly future target instant.
 */
export function computeNextOccurrence(
  schedule: string,
  fromDate = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): Date {
  const [minPart, hourPart] = (schedule || "").trim().split(/\s+/);

  if (minPart?.startsWith("*/") && hourPart === "*") {
    const step = parseInt(minPart.slice(2), 10) || 15;
    const next = new Date(fromDate.getTime() + step * 60 * 1000);
    next.setSeconds(0, 0);
    return next;
  }

  if (!minPart?.startsWith("*") && hourPart?.startsWith("*/")) {
    const next = new Date(fromDate);
    next.setMinutes(parseInt(minPart, 10) || 0, 0, 0);
    next.setHours(next.getHours() + (parseInt(hourPart.slice(2), 10) || 1));
    return next;
  }

  const min = parseInt(minPart, 10);
  const hour = parseInt(hourPart, 10);
  if (!isNaN(min) && !isNaN(hour)) {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = dtf.formatToParts(fromDate);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;

    const h = String(hour).padStart(2, "0");
    const m = String(min).padStart(2, "0");

    let next = new Date(
      `${map.year}-${map.month}-${map.day}T${h}:${m}:00${DEFAULT_UTC_OFFSET}`,
    );
    if (next.getTime() <= fromDate.getTime()) {
      next = new Date(next.getTime() + DAY_MS);
    }
    return next;
  }

  const fallback = new Date(fromDate.getTime() + DAY_MS);
  fallback.setSeconds(0, 0);
  return fallback;
}
