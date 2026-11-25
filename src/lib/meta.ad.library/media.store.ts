/**
 * Media store: uploads scraped creatives into the existing content-addressed
 * attachment store (R2) and returns stable refs.
 *
 * `assetId` is the sha256 of the exact bytes, so re-storing the same creative —
 * from any ad id, on any later run — is a no-op.
 *
 * @module @/lib/meta.ad.library/media.store
 */

import { getAttachmentStore } from "@/lib/attachments";
import { attachmentIdToHex } from "@/lib/attachments/core";
import { attachmentUrl } from "@/lib/attachments/asset.url";
import type { AdMediaRef, AdMediaSource, AdMediaStore } from "./types";

/** Guard rail: skip absurdly large files instead of buffering them. */
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 90_000;
const DOWNLOAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export function createMediaStore(): AdMediaStore {
  return {
    async store(source: AdMediaSource): Promise<AdMediaRef | null> {
      const res = await fetch(source.url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: { "user-agent": DOWNLOAD_UA },
      });
      if (!res.ok) return null;

      const mimeType = (res.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim();
      const data = new Uint8Array(await res.arrayBuffer());
      if (data.byteLength === 0 || data.byteLength > MAX_MEDIA_BYTES) {
        return null;
      }

      const ref = await getAttachmentStore().saveFile({
        data,
        mediaType: mimeType || undefined,
        name: `ad-${source.kind}`,
      });

      const assetId = attachmentIdToHex(ref.attachmentId);
      return {
        kind: source.kind,
        assetId,
        url: attachmentUrl(assetId),
        mimeType: mimeType || null,
        bytes: ref.bytes,
      };
    },
  };
}
