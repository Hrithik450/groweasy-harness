/**
 * Model-facing presentation of a scraped ad card.
 *
 * Stored ad content is raw scraped markdown: it carries Meta's UI chrome
 * (avatar thumbnails, "Platforms", "See ad details"), zero-width layout
 * characters, and creative images embedded as markdown. This module turns that
 * into the crisp card the model reads, and drops media links whose signed CDN
 * expiry has passed — Meta's `oe` parameter is an absolute expiry, and cached
 * ads are routinely served days after the crawl that captured them.
 *
 * The card's canonical text (used for hashing and embeddings) is computed
 * elsewhere from the raw card, so presentation changes never alter ad identity.
 *
 * @module @openai-harness/scraper/src/display
 */

/** Frontend chrome lines that carry no ad information. */
const NOISE_LINE_RE =
  /^(?:\*[* ]*\*[* ]*\*|platforms|see ad details|\*\*sponsored\*\*|sponsored)$/i;

/** A markdown image, capturing its source URL. */
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g;

/** A line that is one of the media lines this pipeline appends. */
const MEDIA_LINE_RE = /^(Video|Image):\s+(https?:\S+)$/i;

/** Zero-width characters Meta interleaves into rendered layout. */
const ZERO_WIDTH_RE = /[\u200b\u200c\u200d\ufeff]/g;

/** Whitespace-only (or zero-width-only) line. */
const BLANK_LINE_RE = /^[\s\u200b\u200c\u200d\ufeff]*$/;

/** Meta renders advertiser avatars as tiny 60x60 profile images. */
export function isAvatarMediaUrl(src: string): boolean {
  return /(?:^|[^0-9])s60x60(?:[^0-9]|$)/i.test(src);
}

/**
 * Absolute expiry of a signed Meta CDN URL, from its `oe` parameter.
 *
 * @param url - media URL as scraped.
 * @returns epoch milliseconds, or `null` when the URL is unsigned/opaque.
 */
export function mediaUrlExpiresAt(url: string): number | null {
  const match = /[?&]oe=([0-9a-f]{6,})(?:&|$)/i.exec(url);
  if (!match) return null;
  const seconds = Number.parseInt(match[1], 16);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

/**
 * Whether a signed media URL is already past its expiry.
 *
 * @param url - media URL as scraped.
 * @param nowMs - clock injection for tests.
 */
export function isMediaUrlExpired(
  url: string,
  nowMs: number = Date.now(),
): boolean {
  const expiresAt = mediaUrlExpiresAt(url);
  return expiresAt !== null && expiresAt <= nowMs;
}

/**
 * Remove media lines whose signed URL has expired, keeping the rest of the
 * card intact. Storage keeps the raw URL; only the model-facing copy is
 * scrubbed, so the expiry stays visible to any future re-crawl.
 *
 * @param content - card content.
 * @param nowMs - clock injection for tests.
 * @returns the cleaned content and how many media lines were dropped.
 */
export function stripExpiredMediaLines(
  content: string,
  nowMs: number = Date.now(),
): { content: string; dropped: number } {
  let dropped = 0;
  const lines = content.split("\n").filter((line) => {
    const match = MEDIA_LINE_RE.exec(line.trim());
    if (match === null) return true;
    if (!isMediaUrlExpired(match[2], nowMs)) return true;
    dropped += 1;
    return false;
  });
  return { content: lines.join("\n").trim(), dropped };
}

/** Creative media URLs of one card, split by kind. */
export interface CardMediaUrls {
  videos: string[];
  images: string[];
}

/**
 * Every live creative URL in one card, read from its crisp form.
 *
 * Downstream consumers (the business profile's competitor ads, for example)
 * must not depend on the model copying a 400-character signed URL out of the
 * transcript: the crawl captured it, so the URL is read back from storage.
 * Expired links are dropped here for the same reason as everywhere else —
 * Meta's `oe` expiry passes within days.
 *
 * @param content - card content, crisp or raw.
 * @param nowMs - clock injection for the expiry filter.
 */
export function extractMediaUrls(
  content: string,
  nowMs: number = Date.now(),
): CardMediaUrls {
  const videos: string[] = [];
  const images: string[] = [];
  const seen = new Set<string>();

  for (const line of crispAdCardContent(content).split("\n")) {
    const match = MEDIA_LINE_RE.exec(line.trim());
    if (match === null) continue;
    const url = match[2];
    if (seen.has(url) || isMediaUrlExpired(url, nowMs)) continue;
    seen.add(url);
    (match[1].toLowerCase() === "video" ? videos : images).push(url);
  }

  return { videos, images };
}

/**
 * Turn a raw scraped card into the text the model reads.
 *
 * - drops zero-width characters, avatar thumbnails, and Meta chrome lines;
 * - lifts inline creative images out of the body into `Image:` lines so every
 *   creative URL is discoverable exactly like a video URL;
 * - collapses runs of blank lines to one.
 *
 * Idempotent: an already-crisp card passes through unchanged.
 *
 * @param content - raw card markdown.
 */
export function crispAdCardContent(content: string): string {
  if (!content) return "";

  const creativeImages: string[] = [];
  const lines: string[] = [];
  let pendingBlank = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(ZERO_WIDTH_RE, "").trim();
    if (line === "" || BLANK_LINE_RE.test(line)) {
      pendingBlank = lines.length > 0;
      continue;
    }

    const imagesOnly = /^!\[[^\]]*\]\(([^)\s]+)\)$/.exec(line);
    if (imagesOnly !== null) {
      if (!isAvatarMediaUrl(imagesOnly[1])) creativeImages.push(imagesOnly[1]);
      continue;
    }

    const withoutImages = line
      .replace(MARKDOWN_IMAGE_RE, (_whole, src: string) => {
        if (!isAvatarMediaUrl(src)) creativeImages.push(src);
        return "";
      })
      .trim();
    if (withoutImages === "" || NOISE_LINE_RE.test(withoutImages)) continue;

    if (pendingBlank) {
      lines.push("");
      pendingBlank = false;
    }
    lines.push(withoutImages);
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const seenMedia = new Set<string>();
  for (const line of lines) {
    const match = MEDIA_LINE_RE.exec(line);
    if (match !== null) seenMedia.add(match[2]);
  }
  for (const src of creativeImages) {
    if (seenMedia.has(src)) continue;
    seenMedia.add(src);
    lines.push(`Image: ${src}`);
  }

  return lines.join("\n");
}
