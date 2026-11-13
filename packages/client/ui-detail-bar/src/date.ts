/**
 * Ad Manager alert/telemetry timestamp formatting.
 *
 * Moved verbatim from the application's `@/lib/utils/date` so the package is
 * standalone. Formats any timestamp (Date, ISO string, epoch ms/seconds, or
 * legacy relative text) as `Nov 7, 2026 · 3:15 PM`.
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

/** Checks whether a string is already `MMM D, YYYY · h:mm A`. */
const ALREADY_STRUCTURED_REGEX =
  /^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+·\s+\d{1,2}:\d{2}\s+(?:AM|PM)$/;

/** Parses `10:15 AM` / `3:05 PM` into 24-hour parts. */
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

/** Formats a Date as `MMM D, YYYY · h:mm A`. */
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
 * Formats any timestamp into the Ad Manager structured display format.
 * @param val - Date, epoch (ms or seconds), ISO string, or legacy relative text.
 * @returns `Nov 7, 2026 · 3:15 PM`; the current time when input is absent or invalid.
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
