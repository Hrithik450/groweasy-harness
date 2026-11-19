/**
 * File-extension and media-type lookup shared by upload receipts, delivery
 * routes, and tools that materialize an attachment as a local file.
 *
 * @module @/lib/attachments/core/media-type
 */

/** Single source of truth for file extension -> MIME type mappings. */
export const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".ass": "text/x-ssa",
  ".srt": "text/plain",
  ".txt": "text/plain",
  ".json": "application/json",
};

/** Conventional extension for each known MIME type. */
export const MIME_TO_EXT: Record<string, string> = Object.entries(
  EXT_TO_MIME,
).reduce<Record<string, string>>(
  (acc, [ext, mime]) => {
    if (!acc[mime]) acc[mime] = ext === ".jpeg" ? ".jpg" : ext;
    return acc;
  },
  {
    "image/jpg": ".jpg",
    "audio/mp3": ".mp3",
    "audio/x-wav": ".wav",
    "text/ssa": ".ass",
  },
);

/**
 * Resolve a MIME type from a file extension. Accepts extensions with or
 * without the leading dot and falls back to `application/octet-stream`.
 */
export function getMimeTypeFromExt(ext: string): string {
  const normalized = ext.startsWith(".") ? ext : `.${ext}`;
  return EXT_TO_MIME[normalized.toLowerCase()] ?? "application/octet-stream";
}

/** Resolve the conventional extension for a MIME type, or "" when unknown. */
export function getExtensionForMimeType(mediaType: string): string {
  return MIME_TO_EXT[mediaType.trim().toLowerCase()] ?? "";
}

/** Keep only a short, safe extension such as ".mp4". */
export function sanitizeExtension(ext: string): string {
  const normalized = ext.toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(normalized) ? normalized : "";
}
