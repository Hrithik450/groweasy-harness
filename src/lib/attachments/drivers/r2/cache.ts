import os from "os";
import fs from "fs";
import path from "path";
import type { RequestImageAttachment } from "@/lib/attachments/core";

/**
 * Ephemeral local cache for LLM request image variants to guarantee
 * low latency (<5ms) during model turns and tool invocations.
 */
export class EphemeralRequestCache {
  private readonly memoryCache = new Map<string, RequestImageAttachment>();
  private readonly cacheDir: string;
  private readonly maxMemoryItems = 50;

  constructor() {
    this.cacheDir = path.join(os.tmpdir(), "openai-harness-attachment-cache");
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch {
      // Ignore directory creation errors in serverless environments
    }
  }

  get(variantId: string): RequestImageAttachment | null {
    // 1. Check in-memory Map first (0ms latency)
    const mem = this.memoryCache.get(variantId);
    if (mem) return mem;

    // 2. Check local disk cache
    try {
      const diskPath = path.join(this.cacheDir, `${variantId}.json`);
      if (fs.existsSync(diskPath)) {
        const raw = fs.readFileSync(diskPath, "utf-8");
        const parsed = JSON.parse(raw) as {
          base64?: string;
          mediaType: RequestImageAttachment["mediaType"];
          width: number;
          height: number;
          bytes: number;
        };
        const item: RequestImageAttachment = {
          data: Buffer.from(parsed.base64 ?? "", "base64"),
          mediaType: parsed.mediaType,
          width: parsed.width,
          height: parsed.height,
          bytes: parsed.bytes,
        };
        this.setMemory(variantId, item);
        return item;
      }
    } catch {
      // Ignore disk read error
    }

    return null;
  }

  set(variantId: string, item: RequestImageAttachment): void {
    this.setMemory(variantId, item);

    try {
      const diskPath = path.join(this.cacheDir, `${variantId}.json`);
      fs.writeFileSync(
        diskPath,
        JSON.stringify({
          base64: Buffer.from(item.data).toString("base64"),
          mediaType: item.mediaType,
          width: item.width,
          height: item.height,
          bytes: item.bytes,
        }),
        "utf-8",
      );
    } catch {
      // Ignore disk write error
    }
  }

  private setMemory(variantId: string, item: RequestImageAttachment): void {
    if (this.memoryCache.size >= this.maxMemoryItems) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }
    this.memoryCache.set(variantId, item);
  }
}
