import { APP_TIME_ZONE } from "@/lib/constants";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The app reports in Asia/Kolkata, a fixed +05:30 offset. */
const APP_OFFSET = "+05:30";

/**
 * Convert an inclusive `YYYY-MM-DD` range into `[startIso, endIso)` instants
 * for a database query. Both dates are interpreted in the app's timezone.
 */
export function dayRangeToIso(
  startDate: string,
  endDate: string,
): { startIso: string; endIso: string } {
  if (APP_TIME_ZONE !== "Asia/Kolkata") {
    throw new Error("Date range helper only supports the app timezone.");
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new Error("Dates must use YYYY-MM-DD.");
  }

  const start = new Date(`${startDate}T00:00:00.000${APP_OFFSET}`);
  const end = new Date(`${endDate}T00:00:00.000${APP_OFFSET}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Dates must be valid calendar days.");
  }
  if (start.getTime() > end.getTime()) {
    throw new Error("startDate must be on or before endDate.");
  }

  return {
    startIso: start.toISOString(),
    endIso: new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
