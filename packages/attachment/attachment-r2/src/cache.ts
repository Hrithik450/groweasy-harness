import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { RequestImageAttachment } from "@openai-harness/attachment";

/**
 * Ephemeral local cache for LLM request image variants to guarantee
 * low latency (<5ms) during model turns and tool invocations.
 *
 * The on-disk directory is shared by every tenant on the host, so the cache
 * key incorporates the store namespace. Two tenants may legitimately store the
 * same content-addressed attachment id; without the namespace prefix one
 * tenant could read another tenant's derived request image.
 *
 * This is a derived-bytes cache, never durable attachment storage: clearing it
 * only forces regeneration from the R2 object.
 */
export class EphemeralRequestCache {
  private readonly memoryCache = new Map<string, RequestImageAttachment>();
  private readonly cacheDir: string;
  private readonly keyPrefix: string;
  private readonly maxMemoryItems = 50;

  constructor(namespace?: string) {
    this.cacheDir = path.join(os.tmpdir(), "openai-harness-attachment-cache");
    this.keyPrefix = namespace
      ? crypto.createHash("sha256").update(namespace).digest("hex").slice(0, 24)
      : "";
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch {}
  }

  private cacheKey(variantId: string): string {
    return this.keyPrefix ? `${this.keyPrefix}-${variantId}` : variantId;
  }

  get(variantId: string): RequestImageAttachment | null {
    const key = this.cacheKey(variantId);
    const mem = this.memoryCache.get(key);
    if (mem) return mem;

    try {
      const diskPath = path.join(this.cacheDir, `${key}.json`);
      if (fs.existsSync(diskPath)) {
        const raw = fs.readFileSync(diskPath, "utf-8");
        const parsed = JSON.parse(raw);
        const item: RequestImageAttachment = {
          data: Buffer.from(parsed.base64, "base64"),
          mediaType: parsed.mediaType,
          width: parsed.width,
          height: parsed.height,
          bytes: parsed.bytes,
          depth: "uchar",
          space: "srgb",
          hasAlpha: Boolean(parsed.hasAlpha),
        };
        this.setMemory(key, item);
        return item;
      }
    } catch {}

    return null;
  }

  set(variantId: string, item: RequestImageAttachment): void {
    const key = this.cacheKey(variantId);
    this.setMemory(key, item);

    try {
      const diskPath = path.join(this.cacheDir, `${key}.json`);
      fs.writeFileSync(
        diskPath,
        JSON.stringify({
          base64: Buffer.from(item.data).toString("base64"),
          mediaType: item.mediaType,
          width: item.width,
          height: item.height,
          bytes: item.bytes,
          hasAlpha: item.hasAlpha,
        }),
        "utf-8",
      );
    } catch {}
  }

  private setMemory(key: string, item: RequestImageAttachment): void {
    if (this.memoryCache.size >= this.maxMemoryItems) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }
    this.memoryCache.set(key, item);
  }
}
