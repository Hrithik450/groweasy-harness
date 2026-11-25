/**
 * Scraper-owned text canonicalization.
 *
 * Defines "the same ad" across scrapes by removing volatile, non-creative
 * surface area from hashing and embedding input.
 *
 * @module @/lib/meta.ad.library/ad.scraper/utils
 */

import crypto from "node:crypto";

/** Zero-width characters Meta interleaves into rendered layout. */
export const ZERO_WIDTH_RE = /[​‌‍﻿]/g;

/** The numeric Meta ad id inside a stored reference. */
export function extractAdIdFromReference(ref: string): string | null {
  if (!ref || typeof ref !== "string") return null;
  const match = ref.match(/\d{10,25}/);
  return match ? match[0] : null;
}

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
