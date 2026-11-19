/**
 * R2 -> local scratch materialization for callers that require a real file
 * (ffmpeg, ffprobe, whisper, lip-sync).
 *
 * Lifecycle:
 * - `materializeAttachment` writes a content-hash-keyed file under a
 *   per-process scratch directory and returns its path. Repeated calls reuse
 *   the cached file while its size matches the stored object's byte length.
 * - Callers that need the file for one operation should prefer
 *   `withMaterializedAttachment`, which deletes it in a `finally` block.
 * - Files left behind by abrupt failures are swept opportunistically: at most
 *   once an hour, a call removes scratch files older than 24 hours.
 * - Durable bytes never live on the host filesystem. Scratch files are
 *   disposable and may be removed at any time.
 *
 * @module @/lib/attachments/materialize
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AttachmentError,
  attachmentIdToHex,
  type AttachmentId,
  type FileAttachmentRef,
  type ImageAttachmentRef,
  type ImageMediaType,
} from "./core";
import { parseAttachmentId } from "./core/keys";
import {
  getExtensionForMimeType,
  sanitizeExtension,
} from "./core/media-type";
import { getAttachmentStore } from "./host";

const SCRATCH_ROOT = path.join(
  os.tmpdir(),
  "openai-harness-attachments",
  "scratch",
);
const SCRATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

let lastSweepAt = 0;

/** Ensure and return the process-local scratch directory. */
export async function ensureScratchDir(): Promise<string> {
  await fs.promises.mkdir(SCRATCH_ROOT, { recursive: true });
  return SCRATCH_ROOT;
}

/**
 * Materialize one attachment as a local file and return its path.
 *
 * @throws {AttachmentError} `ATTACHMENT_NOT_FOUND` when the object is absent,
 *   or `STORAGE_ERROR` when the reference is malformed.
 */
export async function materializeAttachment(
  urlOrId: string,
  signal?: AbortSignal,
): Promise<string> {
  const attachmentId = parseAttachmentId(urlOrId);
  const store = getAttachmentStore();
  const head = await store.headAttachment(attachmentId);

  if (!head) {
    throw new AttachmentError(
      `Attachment ${attachmentId} was not found.`,
      "ATTACHMENT_NOT_FOUND",
    );
  }

  const dir = await ensureScratchDir();
  const target = path.join(dir, `${attachmentIdToHex(attachmentId)}${extensionFor(head)}`);
  const expectedBytes = head.bytes ?? 0;

  try {
    const stat = await fs.promises.stat(target);
    if (stat.isFile() && (expectedBytes <= 0 || stat.size === expectedBytes)) {
      void sweepScratch(dir);
      return target;
    }
  } catch {
    // Not cached yet.
  }

  const temp = `${target}.${process.pid}.${Date.now()}.part`;

  try {
    if (head.kind === "image") {
      const ref = imageRefFromHead(attachmentId, head);
      const stored = await store.readImage(ref, signal);
      await fs.promises.writeFile(temp, stored.data);
    } else {
      const ref = fileRefFromHead(attachmentId, head);
      const handle = await fs.promises.open(temp, "w");
      try {
        for await (const chunk of store.readFileStream(ref, signal)) {
          signal?.throwIfAborted();
          await handle.write(chunk);
        }
      } finally {
        await handle.close();
      }
    }
    await fs.promises.rename(temp, target);
  } catch (error) {
    await fs.promises.rm(temp, { force: true });
    throw error;
  }

  void sweepScratch(dir);
  return target;
}

/**
 * Materialize one attachment, run `operation`, then delete the scratch file
 * even when the operation throws.
 */
export async function withMaterializedAttachment<T>(
  urlOrId: string,
  operation: (localPath: string) => Promise<T> | T,
  signal?: AbortSignal,
): Promise<T> {
  const localPath = await materializeAttachment(urlOrId, signal);
  try {
    return await operation(localPath);
  } finally {
    await fs.promises.rm(localPath, { force: true });
  }
}

function extensionFor(head: {
  kind: "image" | "file";
  contentType?: string;
  metadata?: Record<string, string>;
}): string {
  if (head.kind === "image") {
    return (
      sanitizeExtension(getExtensionForMimeType(head.contentType ?? "")) ||
      ".img"
    );
  }

  const name = decodeMetadataName(head.metadata?.["original-name"]);
  return (
    sanitizeExtension(name ? path.extname(name) : "") ||
    sanitizeExtension(getExtensionForMimeType(head.contentType ?? "")) ||
    ".bin"
  );
}

function imageRefFromHead(
  attachmentId: AttachmentId,
  head: {
    contentType?: string;
    bytes?: number;
    metadata?: Record<string, string>;
  },
): ImageAttachmentRef {
  const name = decodeMetadataName(head.metadata?.["original-name"]);
  return {
    attachmentId,
    mediaType: asImageMediaType(head.contentType),
    bytes: head.bytes ?? 0,
    width: Number(head.metadata?.width ?? 0) || 0,
    height: Number(head.metadata?.height ?? 0) || 0,
    ...(name ? { name } : {}),
  };
}

function fileRefFromHead(
  attachmentId: AttachmentId,
  head: {
    contentType?: string;
    bytes?: number;
    metadata?: Record<string, string>;
  },
): FileAttachmentRef {
  const name =
    decodeMetadataName(head.metadata?.["original-name"]) ??
    `attachment-${attachmentIdToHex(attachmentId).slice(0, 12)}`;
  return { attachmentId, name, bytes: head.bytes ?? 0 };
}

function asImageMediaType(contentType: string | undefined): ImageMediaType {
  if (
    contentType === "image/png" ||
    contentType === "image/jpeg" ||
    contentType === "image/webp" ||
    contentType === "image/gif"
  ) {
    return contentType;
  }
  return "image/jpeg";
}

function decodeMetadataName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value) || undefined;
  } catch {
    return value || undefined;
  }
}

async function sweepScratch(dir: string): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;

  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const cutoff = now - SCRATCH_MAX_AGE_MS;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const target = path.join(dir, entry.name);
      try {
        const stat = await fs.promises.stat(target);
        if (stat.mtimeMs < cutoff) {
          await fs.promises.rm(target, { force: true });
        }
      } catch {
        // Best-effort cleanup only.
      }
    }
  } catch {
    // Best-effort cleanup only.
  }
}
