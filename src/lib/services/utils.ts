/** Default lookback window when a date range omits its start. */
const DEFAULT_LONGEVITY_DAYS = 30;

/** The numeric Meta ad id inside a stored reference. */
export function extractAdIdFromReference(ref: string): string | null {
  if (!ref || typeof ref !== "string") return null;
  const match = ref.match(/\d{10,25}/);
  return match ? match[0] : null;
}

/**
 * Validates whether a date string strictly follows the 'YYYY-MM-DD' calendar format.
 */
export function isValidDateString(dateStr?: string | null): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return false;
  const trimmed = dateStr.trim();
  const d = new Date(trimmed + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().startsWith(trimmed);
}

/**
 * Resolves and validates a date range (YYYY-MM-DD).
 * Fallbacks to a default longevity window (e.g. 30 days) when dates are missing.
 * Throws structured descriptive errors for invalid calendar formats or inverted ranges.
 */
export function resolveDateRange(params: {
  startDate?: string | null;
  endDate?: string | null;
}): { startDate: string; endDate: string } {
  const { startDate, endDate } = params;
  const rawStart = startDate?.trim();
  const rawEnd = endDate?.trim();

  if (rawStart && !isValidDateString(rawStart)) {
    throw new Error(
      `Invalid 'startDate': "${rawStart}". Expected format is 'YYYY-MM-DD' (e.g. '2026-04-01').`,
    );
  }

  if (rawEnd && !isValidDateString(rawEnd)) {
    throw new Error(
      `Invalid 'endDate': "${rawEnd}". Expected format is 'YYYY-MM-DD' (e.g. '2026-05-15').`,
    );
  }

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const resolvedEnd = rawEnd || todayStr;

  let resolvedStart: string;
  if (rawStart) {
    resolvedStart = rawStart;
  } else {
    const d = new Date(resolvedEnd + "T00:00:00Z");
    d.setDate(d.getDate() - DEFAULT_LONGEVITY_DAYS);
    resolvedStart = d.toISOString().split("T")[0];
  }

  if (resolvedStart > resolvedEnd) {
    throw new Error(
      `'startDate' (${resolvedStart}) cannot be after 'endDate' (${resolvedEnd}).`,
    );
  }

  return { startDate: resolvedStart, endDate: resolvedEnd };
}
