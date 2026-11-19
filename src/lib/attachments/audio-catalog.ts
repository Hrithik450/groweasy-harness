/**
 * Shared voice-catalog previews backed by R2 and cached in process memory.
 *
 * The catalog is identical for every user and immutable once published, so it
 * lives at one deployment prefix (`R2_AUDIO_PREVIEW_ROOT`, default
 * `harness/audio-previews/`) instead of in user attachment storage. Nothing is
 * written to the host filesystem; a restarted host refills the cache from R2
 * on the first play.
 *
 * @module @/lib/attachments/audio-catalog
 */

import path from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getAttachmentStore } from "./host";

const DEFAULT_KEY_ROOT = "harness/audio-previews";

/** Memory ceiling for the cache; the full catalog is well under this. */
const MAX_CACHED_BYTES = 48 * 1024 * 1024;

/** Insertion order doubles as recency order: a hit is re-inserted. */
const cache = new Map<string, Buffer>();
let cachedBytes = 0;

/**
 * Load one catalog file by name.
 *
 * @param name file name inside the catalog prefix, without a path prefix.
 * @returns the bytes, or `null` when the catalog does not hold that name.
 */
export async function loadAudioPreview(name: string): Promise<Buffer | null> {
  const safeName = path.basename(name.trim());
  if (!safeName) return null;

  const hit = cache.get(safeName);
  if (hit !== undefined) {
    cache.delete(safeName);
    cache.set(safeName, hit);
    return hit;
  }

  try {
    const store = getAttachmentStore();
    const response = await store.client.send(
      new GetObjectCommand({
        Bucket: store.bucketName,
        Key: `${keyRoot()}/${safeName}`,
      }),
    );
    if (!response.Body) return null;

    const buffer = Buffer.from(await response.Body.transformToByteArray());
    cache.set(safeName, buffer);
    cachedBytes += buffer.length;
    evictToLimit();
    return buffer;
  } catch (error) {
    // A catalog that cannot be consulted reads as "no such preview" to the
    // caller; the cause still goes to the log so a broken bucket does not hide.
    console.error(
      `[audio-catalog] lookup failed for ${safeName}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function keyRoot(): string {
  return process.env.R2_AUDIO_PREVIEW_ROOT?.trim() || DEFAULT_KEY_ROOT;
}

function evictToLimit(): void {
  while (cachedBytes > MAX_CACHED_BYTES && cache.size > 0) {
    const oldest = cache.keys().next();
    if (oldest.done === true) return;
    const value = cache.get(oldest.value);
    cache.delete(oldest.value);
    if (value !== undefined) cachedBytes -= value.length;
  }
}
