/**
 * Shared voice catalog, backed by R2 and cached in process memory.
 *
 * The catalog is identical for every tenant and immutable once published, so
 * it is not tenant storage: it lives at one deployment prefix
 * (`R2_AUDIO_PREVIEW_ROOT`, default `harness/audio-previews/`) and is read
 * straight into an LRU. Nothing is written to disk — a host that restarts
 * refills the cache from R2 on first play.
 *
 * @module @openai-harness/gateway/routes/audio-catalog
 */

import { getGlobalObjectBuffer } from "@openai-harness/attachment-r2";

/** Deployment prefix holding the shared voice catalog objects. */
const DEFAULT_KEY_ROOT = "harness/audio-previews";

/**
 * Memory ceiling for the cache. The full catalog is ~29 MB of audio, so this
 * holds every preview with headroom while still bounding a long-lived host.
 */
const MAX_CACHED_BYTES = 48 * 1024 * 1024;

/** Insertion order doubles as recency order: a hit is re-inserted. */
const cache = new Map<string, Buffer>();
let cachedBytes = 0;

/** Evict oldest entries until the cache fits the ceiling. */
function evictToLimit(): void {
  while (cachedBytes > MAX_CACHED_BYTES && cache.size > 0) {
    const oldest = cache.keys().next();
    if (oldest.done === true) return;
    const value = cache.get(oldest.value);
    cache.delete(oldest.value);
    if (value !== undefined) cachedBytes -= value.length;
  }
}

/** Deployment prefix for catalog objects. */
function keyRoot(): string {
  return process.env.R2_AUDIO_PREVIEW_ROOT?.trim() || DEFAULT_KEY_ROOT;
}

/**
 * Load one catalog file by name.
 *
 * @param name file name inside the catalog prefix, without a path prefix.
 * @returns the bytes, or `null` when the catalog does not hold that name.
 */
export async function loadAudioPreview(name: string): Promise<Buffer | null> {
  const hit = cache.get(name);
  if (hit !== undefined) {
    // Re-insert so the entry counts as recently used.
    cache.delete(name);
    cache.set(name, hit);
    return hit;
  }

  const buffer = await getGlobalObjectBuffer(`${keyRoot()}/${name}`);
  if (buffer === null) return null;

  cache.set(name, buffer);
  cachedBytes += buffer.length;
  evictToLimit();
  return buffer;
}
