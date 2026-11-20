/**
 * Scraper-owned text canonicalization.
 *
 * Defines "the same ad" across scrapes by removing volatile, non-creative
 * surface area from hashing and embedding input.
 *
 * @module @/lib/services/scraper/utils
 */

import crypto from "node:crypto";

const ZERO_WIDTH_RE = /[​‌‍﻿]/g;

/** Stable SHA-256 hex digest. */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Canonical form of an ad card, used for both content hashing and embedding.
 *
 * Removes signed/CDN URLs (including injected media lines), zero-width
 * characters, collapsed whitespace, and per-scrape counters that sit in Meta's
 * status/metadata lines but never inside creative copy.
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

/** Canonical form of a search query (whitespace/URL/zero-width noise only). */
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
 * "WhatsApp CRM", "whatsapp  crm", and `"WhatsApp CRM."` are the same search to
 * a user. Lowercases, collapses whitespace, and strips surrounding punctuation
 * so the exact cache matches them without extra columns. A punctuation-only
 * query falls back to its whitespace-collapsed form.
 */
export function normalizeQueryKey(query: string): string {
  const collapsed = canonicalizeQueryText(query).toLowerCase();
  const stripped = collapsed.replace(
    /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
    "",
  );
  return stripped || collapsed;
}

/** Cache key for an embedding: `sha256(model + canonical text)`. */
export function computeEmbeddingHash(
  embeddingModel: string,
  canonicalText: string,
): string {
  return sha256Hex(`${embeddingModel}\n${canonicalText}`);
}

/**
 * Normalizes a Meta Ad Library launch date string (e.g. "Started running on
 * Nov 7, 2026" or "Nov 7, 2026") into ISO `YYYY-MM-DD`.
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
