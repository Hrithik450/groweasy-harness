/**
 * End-to-end probe for the tenant-scoped R2 attachment store.
 *
 * Writes one generated PNG, reads it back, derives a request variant, opens
 * the delivery streams (full and range), resolves the app URL, then deletes
 * the object. Every key stays inside this tenant's `openai-harness/t/...`
 * namespace.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/probe-attachment-store.ts
 */

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  attachmentStoreFor,
  isImageAttachmentRef,
  resolveAttachmentRef,
  resolveImageRef,
  saveAttachment,
  tenantNamespace,
  type Attachment,
  type R2StreamedObject,
} from "@openai-harness/attachment-r2";

async function countStream(object: R2StreamedObject): Promise<number> {
  let total = 0;
  for await (const chunk of object.body) {
    total += chunk.byteLength;
  }
  return total;
}

async function main(): Promise<void> {
  const tenantId = `probe-${randomUUID()}`;
  const store = attachmentStoreFor(tenantId);
  let saved: Attachment | undefined;

  try {
    console.log("namespace:", tenantNamespace(tenantId));
    console.log("store namespace:", store.namespace);

    const png = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 4,
        background: { r: 20, g: 120, b: 220, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    saved = await saveAttachment(
      png,
      { filename: "probe.png", mimeType: "image/png", storage: "tmp" },
      tenantId,
    );
    console.log("saved:", {
      id: saved.id,
      url: saved.url,
      bytes: saved.bytes,
      mediaType: saved.mimeType,
      width: saved.width,
      height: saved.height,
    });

    if (!isImageAttachmentRef(saved.ref)) {
      throw new Error("saved attachment is not an image");
    }
    const imageRef = saved.ref;

    const stored = await store.readImage(imageRef);
    console.log("read back bytes:", stored.data.byteLength);

    const variant = await store.readImageRequest(imageRef, {
      width: 1568,
      height: 1568,
      maxBytes: 3_500_000,
    });
    console.log("request variant:", {
      mediaType: variant.mediaType,
      bytes: variant.bytes,
      width: variant.width,
      height: variant.height,
      variantId: variant.variantId,
    });

    const full = await store.openAttachmentObject(saved.ref.attachmentId);
    if (!full) throw new Error("full object was not opened");
    console.log("serve full:", {
      contentType: full.contentType,
      contentLength: full.contentLength,
      streamedBytes: await countStream(full),
    });

    const ranged = await store.openAttachmentObject(saved.ref.attachmentId, {
      range: "bytes=0-9",
    });
    if (!ranged) throw new Error("range object was not opened");
    console.log("serve range:", {
      contentRange: ranged.contentRange,
      contentLength: ranged.contentLength,
      streamedBytes: await countStream(ranged),
    });

    const resolved = await resolveAttachmentRef(saved.url, tenantId);
    const image = await resolveImageRef(saved.id, tenantId);
    console.log("resolved:", {
      attachmentId: resolved.attachmentId,
      imageWidth: "width" in image ? image.width : undefined,
      imageHeight: "height" in image ? image.height : undefined,
    });

    await store.deleteAttachment(saved.ref.attachmentId);
    console.log(
      "head after delete:",
      await store.headAttachment(saved.ref.attachmentId),
    );
    saved = undefined;
  } finally {
    if (saved) {
      await store.deleteAttachment(saved.ref.attachmentId).catch(() => {});
    }
  }

  console.log("probe complete");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
