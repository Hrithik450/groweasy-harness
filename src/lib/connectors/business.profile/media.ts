import type { CompetitorAdMedia } from "./types";

const VIDEO_EXTENSION = /\.(mp4|m4v|webm|mov|m3u8)$/i;
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|avif)$/i;

/**
 * Universal creative-URL validator.
 *
 * Meta serves video from `video.*` hosts (`.mp4` paths) and images from
 * `scontent` / `cdninstagram` as image files.
 */
export function isValidAdMediaUrl(
  url: unknown,
  kind: "video" | "image",
): boolean {
  if (typeof url !== "string" || !url.trim()) return false;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const path = parsed.pathname.toLowerCase();
  if (kind === "video") {
    return VIDEO_EXTENSION.test(path) || parsed.hostname.startsWith("video.");
  }
  if (parsed.hostname.startsWith("video.")) return false;
  return IMAGE_EXTENSION.test(path);
}

/** One `{ kind, url }` creative entry with a supported URL. */
export function isCompetitorAdMedia(value: unknown): value is CompetitorAdMedia {
  const media = value as { kind?: unknown; url?: unknown } | null;
  if (media?.kind !== "video" && media?.kind !== "image") return false;
  return isValidAdMediaUrl(media.url, media.kind);
}
