/**
 * Ad Manager Alert & Telemetry Timestamp Utility
 *
 * Formats any timestamp (Date instance, ISO 8601 string, unix timestamp in ms or seconds,
 * or legacy relative text like "Today · 10:15 AM") into the standard Ad Manager structured format:
 * `Nov 7, 2026 · 3:15 PM` (Month D, YYYY · h:mm A).
 */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Checks whether a given string is already formatted as `MMM D, YYYY · h:mm A`.
 */
const ALREADY_STRUCTURED_REGEX =
  /^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+·\s+\d{1,2}:\d{2}\s+(?:AM|PM)$/;

/**
 * Parses time string like "10:15 AM" or "3:05 PM" into hours and minutes.
 */
function parseTimePart(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return { hours: h, minutes: m };
}

/**
 * Formats a Date object into `MMM D, YYYY · h:mm A` (e.g. `Nov 7, 2026 · 3:15 PM`).
 */
function formatToStructuredString(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${month} ${day}, ${year} · ${hours}:${minutes} ${ampm}`;
}

/**
 * Formats any timestamp into the Ad Manager structured display format: `Nov 7, 2026 · 3:15 PM`.
 * If no timestamp is provided or an invalid date is passed, returns the formatted current timestamp.
 */
export function formatAlertTimestamp(
  val?: string | number | Date | null,
): string {
  if (val === undefined || val === null || val === "") {
    return formatToStructuredString(new Date());
  }

  if (val instanceof Date) {
    return isNaN(val.getTime())
      ? formatToStructuredString(new Date())
      : formatToStructuredString(val);
  }

  if (typeof val === "number") {
    const ms = val < 1e11 ? val * 1000 : val;
    const date = new Date(ms);
    return isNaN(date.getTime())
      ? formatToStructuredString(new Date())
      : formatToStructuredString(date);
  }

  if (typeof val === "string") {
    const trimmed = val.trim();

    if (ALREADY_STRUCTURED_REGEX.test(trimmed)) {
      return trimmed;
    }

    const todayMatch = trimmed.match(/^Today\s*·\s*(.+)$/i);
    if (todayMatch) {
      const parsedTime = parseTimePart(todayMatch[1]);
      if (parsedTime) {
        const d = new Date();
        d.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
        return formatToStructuredString(d);
      }
    }

    const yesterdayMatch = trimmed.match(/^Yesterday\s*·\s*(.+)$/i);
    if (yesterdayMatch) {
      const parsedTime = parseTimePart(yesterdayMatch[1]);
      if (parsedTime) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        d.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
        return formatToStructuredString(d);
      }
    }

    const parsedEpoch = Date.parse(trimmed);
    if (!isNaN(parsedEpoch)) {
      return formatToStructuredString(new Date(parsedEpoch));
    }

    const num = Number(trimmed);
    if (!isNaN(num) && num > 0) {
      const ms = num < 1e11 ? num * 1000 : num;
      const date = new Date(ms);
      if (!isNaN(date.getTime())) {
        return formatToStructuredString(date);
      }
    }
  }

  return formatToStructuredString(new Date());
}
