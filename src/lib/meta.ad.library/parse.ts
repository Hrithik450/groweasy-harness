/**
 * Markdown parsing for the Crawl4AI fallback.
 *
 * @module @/lib/meta.ad.library/parse
 */

const LIBRARY_ID_RE = /Library ID:\s*(\d+)/g;

export interface ParsedAdCard {
  libraryId: string;
  adUrl: string;
  content: string;
  startDate: string | null;
  status: "active" | "inactive";
}

/** Meta appends labels after the status ("Active Low impression count"). */
function readStatus(before: string): "active" | "inactive" {
  const match = /(?:^|\n)[ \t]*(Active|Inactive)\b[^\n]*[ \t]*$/i.exec(before);
  return match !== null && match[1].toLowerCase() === "inactive"
    ? "inactive"
    : "active";
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

/**
 * Parses Meta Ad Library markdown into cards, one per `Library ID` anchor.
 *
 * Anchoring on the id alone (rather than on a hydrated status line) keeps
 * partially rendered pages usable; the status falls back to active because the
 * search URL only requests running ads.
 */
export function parseMetaAdCards(markdown: string): ParsedAdCard[] {
  if (!markdown) return [];

  const anchors = Array.from(markdown.matchAll(LIBRARY_ID_RE));
  const seen = new Set<string>();
  const cards: ParsedAdCard[] = [];

  anchors.forEach((match, i) => {
    const libraryId = match[1];
    if (seen.has(libraryId)) return;
    seen.add(libraryId);

    const start = match.index ?? 0;
    const end = anchors[i + 1]?.index ?? markdown.length;
    const chunk = markdown.slice(start, end).trim();
    const date = chunk.match(/Started running on ([^\n·]+)/i);

    cards.push({
      libraryId,
      adUrl: `https://www.facebook.com/ads/library/?id=${libraryId}`,
      content: chunk,
      startDate: date ? parseMetaAdDate(date[0]) : null,
      status: readStatus(markdown.slice(Math.max(0, start - 240), start)),
    });
  });

  return cards;
}
