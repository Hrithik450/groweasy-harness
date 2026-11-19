/**
 * Attachment reference parsing and identifier helpers.
 *
 * Content-addressed ids are the only durable attachment keys now that bytes
 * live in R2. These helpers still accept legacy user-scoped app URLs
 * (`/api/attachments/tmp/<userId>/<file>`) and legacy filename shapes so
 * stored session messages keep resolving after the local-disk layout retires.
 *
 * @module @/lib/attachments/core/keys
 */

import path from "node:path";
import { AttachmentId } from "./brand";
import { AttachmentError } from "./errors";

const ATTACHMENT_URL_PREFIX = "/api/attachments/";

/**
 * Parse a bare digest, `sha256:<hex>` id, or `/api/attachments/...` URL.
 *
 * Legacy URLs may wrap the id in `tmp/<userId>/`, `<userId>/`, or `audios/`
 * segments; the rightmost canonical id wins. Returns `null` when no canonical
 * content id is present.
 */
export function tryParseAttachmentId(urlOrId: string): AttachmentId | null {
  if (!urlOrId) return null;

  let candidate = urlOrId.trim().split(/[?#]/)[0] ?? "";
  if (candidate.startsWith(ATTACHMENT_URL_PREFIX)) {
    candidate = candidate.slice(ATTACHMENT_URL_PREFIX.length);
  }
  candidate = candidate.replace(/^\/+|\/+$/g, "");
  if (!candidate) return null;

  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    return null;
  }

  const segments = candidate.split("/").filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    try {
      return AttachmentId(segments[index]);
    } catch {
      // Not a canonical id; keep scanning the legacy path segments.
    }
  }
  return null;
}

/**
 * Parse an attachment reference and fail with a stable storage error.
 *
 * @throws {AttachmentError} `STORAGE_ERROR` when the value contains no
 *   canonical content-addressed id.
 */
export function parseAttachmentId(urlOrId: string): AttachmentId {
  const attachmentId = tryParseAttachmentId(urlOrId);
  if (!attachmentId) {
    throw new AttachmentError(
      `Invalid attachment reference: "${urlOrId}".`,
      "STORAGE_ERROR",
    );
  }
  return attachmentId;
}

/**
 * Sanitize a legacy file id or display filename: strip directory components
 * and replace characters that are unsafe in object keys.
 */
export function sanitizeAttachmentFileId(fileId: string): string {
  const base = path.basename(fileId).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "attachment";
}
