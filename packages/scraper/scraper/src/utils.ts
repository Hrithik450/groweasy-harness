/**
 * Scraper-owned text canonicalization.
 *
 * Lifted verbatim from the application's `@/lib/services/utils` so the package
 * is self-contained and free of application aliases. Only the helpers the
 * scraper pipeline uses live here; the app keeps its own copy for other
 * features until call sites are rewired.
 *
 * @module @openai-harness/scraper/src/utils
 */

import crypto from "node:crypto";

const ZERO_WIDTH_RE = /[\u200b\u200c\u200d\ufeff]/g;

/** Stable SHA-256 hex digest. */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Canonical form of an ad card, used for both content hashing and embedding.
 *
 * Defines "the same ad" across scrapes by removing volatile, non-creative
 * surface area:
 * - signed/CDN URLs (images, links, media) and the media lines we inject,
 * - zero-width characters and collapsed whitespace,
 * - per-scrape counters such as "Low impression count" and
 *   "Total active time …" (only when they sit in Meta's status/metadata lines,
 *   never inside creative copy).
 */
export function canonicalizeAdText(content: string): string {
  if (!content) return "";

  let text = content.replace(ZERO_WIDTH_RE, "");

  // Injected media lines contain expiring signed URLs.
  text = text.replace(/^[ \t]*(?:Video|Image):[ \t]+https?:\/\/\S+[ \t]*$/gim, "");

  // Volatile status annotation, but only on the leading Active/Inactive line.
  text = text.replace(
    /^([ \t]*)(Active|Inactive)[ \t]*Low impression count[^\n]*$/gim,
    "$1$2",
  );
  // "started running on <date> · Total active time 5 hrs" — keep the date.
  text = text.replace(
    /(Started running on [^\n·]+?)\s*·\s*Total active time[^\n]*/gi,
    "$1",
  );
  // Volatile impression / "N ads use this creative" counters.
  text = text.replace(/^[ \t]*Impressions:[^\n]*$/gim, "");
  text = text.replace(
    /^[ \t]*\*\*\d+ ads?\*\* use this creative and text[ \t]*$/gim,
    "",
  );

  // Markdown images are volatile CDN links; links keep their visible text.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, " ");

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

/**
 * Canonical form of a search query. Queries are keyword phrases, so only
 * whitespace/URL/zero-width noise is removed.
 */
export function canonicalizeQueryText(query: string): string {
  if (!query) return "";
  return query
    .replace(ZERO_WIDTH_RE, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

/**
 * Comparison key for search-query equality.
 *
 * The same phrase arrives in many surface forms: "WhatsApp CRM",
 * "whatsapp  crm", and `"WhatsApp CRM."` are the same search to a user. This
 * key trims, lowercases, collapses internal whitespace, and strips surrounding
 * punctuation so the exact cache matches them without rewriting persisted
 * rows. A punctuation-only query falls back to its whitespace-collapsed form
 * rather than collapsing to a single shared empty key.
 */
export function normalizeQueryKey(query: string): string {
  const collapsed = canonicalizeQueryText(query).toLowerCase();
  const stripped = collapsed.replace(
    /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
    "",
  );
  return stripped || collapsed;
}

/**
 * Content hash of the canonical ad text. This is the ad-version identity used
 * by the embedding cache (`embedding_hash` additionally includes the model).
 */
export function computeContentHash(content: string): string {
  return sha256Hex(canonicalizeAdText(content));
}

/** Cache key for an embedding: `sha256(model + canonical text)`. */
export function computeEmbeddingHash(
  embeddingModel: string,
  canonicalText: string,
): string {
  return sha256Hex(`${embeddingModel}\n${canonicalText}`);
}

/**
 * Normalizes a Meta Ad Library launch date string (e.g. "Started running on Nov 7, 2026"
 * or "Nov 7, 2026") into standard ISO 'YYYY-MM-DD' format.
 */
export function parseMetaAdDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:Started running on\s+)?([A-Za-z]+ \d{1,2}, \d{4})/i,
  );
  if (!match) return null;
  const d = new Date(match[1] + " UTC");
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

/**
 * Normalize a URL or bare domain into a protocol-agnostic hostname/path.
 * @param url - full URL or domain; empty/absent yields `""`.
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

/**
 * Extract the Meta Ad Library id embedded in a reference URL or phrase.
 * @param ref - any string mentioning an ad.
 * @returns the first 10–25 digit run, or `null`.
 */
export function extractAdIdFromReference(ref: string): string | null {
  if (!ref || typeof ref !== "string") return null;
  const match = ref.match(/\d{10,25}/);
  return match ? match[0] : null;
}

/**
 * Whether a string is a real `YYYY-MM-DD` calendar date.
 * @param dateStr - candidate date.
 */
export function isValidDateString(dateStr?: string | null): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return false;
  const trimmed = dateStr.trim();
  const d = new Date(trimmed + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().startsWith(trimmed);
}

/**
 * Resolve and validate an inclusive `YYYY-MM-DD` range.
 *
 * The end defaults to today; the start defaults to 30 days before the end.
 *
 * @param params - optional bounds.
 * @throws when a bound is malformed or the range is inverted.
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
    d.setDate(d.getDate() - 30);
    resolvedStart = d.toISOString().split("T")[0];
  }

  if (resolvedStart > resolvedEnd) {
    throw new Error(
      `'startDate' (${resolvedStart}) cannot be after 'endDate' (${resolvedEnd}).`,
    );
  }

  return { startDate: resolvedStart, endDate: resolvedEnd };
}
