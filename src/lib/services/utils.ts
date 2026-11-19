import crypto from "node:crypto";

/** Default lookback window when a date range omits its start. */
const DEFAULT_LONGEVITY_DAYS = 30;

/**
 * Normalizes a URL or domain into a consistent, protocol-agnostic hostname/path string.
 */
export function normalizeDomainOrUrl(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return (parsed.hostname + parsed.pathname)
      .toLowerCase()
      .replace(/\/+$/, "");
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

export function extractAdIdFromReference(ref: string): string | null {
  if (!ref || typeof ref !== "string") return null;
  const match = ref.match(/\d{10,25}/);
  return match ? match[0] : null;
}

/**
 * Strips raw URLs, markdown images, and markdown links on the fly for semantic embedding.
 * Keeps link text if available.
 */
export function stripUrlsForEmbedding(content: string): string {
  if (!content) return "";
  return content
    .replace(/!\[.*?\]\([^\)]*\)/g, "") // remove markdown images
    .replace(/\[([^\]]*)\]\([^\)]*\)/g, "$1") // preserve markdown link anchor text
    .replace(/https?:\/\/\S+/g, "") // remove bare URLs
    .replace(/[ \t]+/g, " ") // normalize horizontal spaces
    .replace(/\n\s*\n+/g, "\n") // normalize multiple newlines
    .trim();
}

/**
 * Computes an O(1) SHA-256 content hash of the complete ad card markdown/text.
 */
export function computeContentHash(content: string): string {
  return crypto
    .createHash("sha256")
    .update((content || "").trim())
    .digest("hex");
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
