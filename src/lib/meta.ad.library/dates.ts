/**
 * Date-window validation for Ad Library searches.
 *
 * @module @/lib/meta.ad.library/dates
 */

const DEFAULT_LONGEVITY_DAYS = 30;

export function isValidDateString(dateStr?: string | null): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return false;
  const trimmed = dateStr.trim();
  const d = new Date(trimmed + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().startsWith(trimmed);
}

/** Resolves and validates a `YYYY-MM-DD` window; defaults to 30 days. */
export function resolveDateRange(params: {
  startDate?: string | null;
  endDate?: string | null;
}): { startDate: string; endDate: string } {
  const rawStart = params.startDate?.trim();
  const rawEnd = params.endDate?.trim();

  if (rawStart && !isValidDateString(rawStart)) {
    throw new Error(
      `Invalid 'startDate': "${rawStart}". Expected format is 'YYYY-MM-DD'.`,
    );
  }
  if (rawEnd && !isValidDateString(rawEnd)) {
    throw new Error(
      `Invalid 'endDate': "${rawEnd}". Expected format is 'YYYY-MM-DD'.`,
    );
  }

  const now = new Date();
  const resolvedEnd = rawEnd || now.toISOString().split("T")[0];
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
