/**
 * Compact display for the numbers bar cards print.
 *
 * Counts read as 50K / 1.2M / 3.4B, and ROAS always carries its `x`.
 *
 * @module @/lib/utils/metrics.format
 */

function trimDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1_000) return String(value);
  if (abs < 1_000_000) return `${trimDecimal(value / 1_000)}K`;
  if (abs < 1_000_000_000) return `${trimDecimal(value / 1_000_000)}M`;
  return `${trimDecimal(value / 1_000_000_000)}B`;
}

/** `50000` → `50K`; preformatted strings are normalised the same way. */
export function formatCompact(value: number | string | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return compactNumber(value);

  const text = String(value).trim();
  if (!text) return "";
  const numeric = Number(text.replace(/[,\s]/g, ""));
  return Number.isFinite(numeric) ? compactNumber(numeric) : text;
}

/** ROAS always ends in `x`: `1.1` → `1.1x`, `2.0x` stays. */
export function formatRoas(value: number | string | undefined): string {
  if (value === undefined || value === null) return "";
  const text = String(value).trim().replace(/\s+/g, "");
  if (!text) return "";
  if (/^\d+(?:\.\d+)?$/u.test(text)) return `${text}x`;
  return text;
}
