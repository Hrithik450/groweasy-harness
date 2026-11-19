/**
 * Host-facing helpers for the R2 attachment package.
 *
 * Owns the single lazily-constructed store for this deployment plus the
 * application-level read and upload-receipt projections used by delivery
 * routes and connectors. Durable bytes live in R2; nothing here reads the
 * host filesystem.
 *
 * @module @/lib/attachments/host
 */

import {
  attachmentIdToHex,
  type AttachmentId,
  type AttachmentRef,
} from "./core";
import { tryParseAttachmentId } from "./core/keys";
import { getExtensionForMimeType } from "./core/media-type";
import { createR2StoreFromEnv, type R2AttachmentStore } from "./drivers/r2";

let attachmentStore: R2AttachmentStore | undefined;

/**
 * Resolve the deployment's R2-backed attachment store.
 *
 * Construction is lazy, so importing modules that merely reference
 * attachments never requires R2 credentials; the first real use fails loudly
 * when the environment is incomplete.
 */
export function getAttachmentStore(): R2AttachmentStore {
  attachmentStore ??= createR2StoreFromEnv();
  return attachmentStore;
}

/** A downloaded attachment body plus the metadata needed by its caller. */
export interface AttachmentResource {
  attachmentId: AttachmentId;
  data: Uint8Array;
  contentType: string;
  filename: string;
  bytes: number;
}

/**
 * Download one attachment by content id or app URL.
 *
 * Returns `null` for values that are not attachment references, or whose
 * object no longer exists. Callers that accept remote URLs must check the
 * value first; this helper never performs network requests outside R2.
 */
export async function readAttachmentBytes(
  urlOrId: string,
  signal?: AbortSignal,
): Promise<AttachmentResource | null> {
  const attachmentId = tryParseAttachmentId(urlOrId);
  if (!attachmentId) return null;

  const store = getAttachmentStore();
  const head = await store.headAttachment(attachmentId);
  if (!head) return null;

  const object = await store.openAttachmentObject(
    attachmentId,
    signal === undefined ? {} : { signal },
  );
  if (!object) return null;

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of object.body) {
    signal?.throwIfAborted();
    chunks.push(chunk);
    bytes += chunk.byteLength;
  }

  const contentType =
    object.contentType ?? head.contentType ?? "application/octet-stream";

  return {
    attachmentId,
    data: Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      bytes,
    ),
    contentType,
    filename:
      decodeMetadataName(head.metadata?.["original-name"]) ??
      fallbackFilename(attachmentId, contentType),
    bytes,
  };
}

/** UI-facing upload receipt returned by `/api/attachments/upload`. */
export interface AttachmentReceipt {
  id: string;
  filename: string;
  url: string;
  bytes: number;
  mimeType: string;
  /** Retention hint only; R2 has one durable tier. */
  storage?: "tmp" | "artifact";
  seq?: number;
}

/** Project one durable reference into the browser's upload receipt shape. */
export function toAttachmentReceipt(
  ref: AttachmentRef,
  mediaType: string,
  options: {
    storage?: "tmp" | "artifact";
    seq?: number;
    filename?: string;
  } = {},
): AttachmentReceipt {
  const name = "name" in ref && ref.name ? ref.name : undefined;
  const refMediaType =
    "mediaType" in ref && typeof ref.mediaType === "string"
      ? ref.mediaType
      : undefined;
  const effectiveMediaType = refMediaType ?? mediaType;

  return {
    id: ref.attachmentId,
    filename:
      name ??
      options.filename ??
      fallbackFilename(ref.attachmentId, effectiveMediaType),
    url: getAttachmentStore().getPublicUrl(ref),
    bytes: ref.bytes,
    mimeType: effectiveMediaType,
    storage: options.storage,
    seq: options.seq,
  };
}

function decodeMetadataName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value) || undefined;
  } catch {
    return value || undefined;
  }
}

function fallbackFilename(
  attachmentId: AttachmentId,
  contentType: string,
): string {
  const extension = getExtensionForMimeType(contentType) || ".bin";
  return `attachment-${attachmentIdToHex(attachmentId).slice(0, 12)}${extension}`;
}
