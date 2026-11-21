import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import {
  AttachmentError,
  AttachmentId,
  AttachmentStore,
  attachmentIdToHex,
  ImageVariantId,
  isImageAttachmentRef,
  type AttachmentRef,
  type FileAttachmentRef,
  type ImageAttachmentRef,
  type ImageMediaType,
  type ImageRequestTarget,
  type RequestImageAttachment,
  type SaveFileAttachment,
  type SaveFileStreamAttachment,
  type SaveImageAttachment,
  type SaveVideoAttachment,
  type StoredAttachment,
  type VideoAttachmentRef,
} from "@/lib/attachments/core";
import { createR2Client } from "./client";
import { EphemeralRequestCache } from "./cache";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  PresignedUploadResult,
  R2AttachmentHead,
  R2Config,
  R2StreamedObject,
} from "./types";

export * from "./types";
export { createR2Client } from "./client";

/** True when an S3/R2 error means the object does not exist. */
function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.code === "NoSuchKey" ||
    candidate.code === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export class R2AttachmentStore extends AttachmentStore {
  readonly client: S3Client;
  readonly bucketName: string;
  readonly cdnBaseUrl?: string;
  private readonly requestCache = new EphemeralRequestCache();
  private readonly keyPrefix: string;

  constructor(config: R2Config) {
    super();
    this.bucketName = config.bucketName;
    this.cdnBaseUrl = config.cdnBaseUrl?.replace(/\/+$/, "");
    // Every object shares one root so the bucket never gets root-level keys.
    const root = config.keyRoot?.trim().replace(/^\/+|\/+$/g, "") ?? "";
    this.keyPrefix = root ? `${root}/` : "";
    this.client = createR2Client(config);
  }

  // ─── Key Helpers ──────────────────────────────────────────────────────────

  private imageObjectKey(attachmentId: AttachmentId): string {
    const hash = attachmentIdToHex(attachmentId);
    return `${this.keyPrefix}attachments/v1/objects/${hash.slice(0, 2)}/${hash}`;
  }

  private fileObjectKey(attachmentId: AttachmentId): string {
    const hash = attachmentIdToHex(attachmentId);
    return `${this.keyPrefix}attachments/v1/file-objects/${hash.slice(0, 2)}/${hash}`;
  }

  private requestVariantKey(variantId: ImageVariantId): string {
    const hash = attachmentIdToHex(variantId);
    return `${this.keyPrefix}attachments/v1/cache/request-images/${hash.slice(0, 2)}/${hash}`;
  }

  // ─── Write Operations ─────────────────────────────────────────────────────

  async validateImage(input: SaveImageAttachment): Promise<void> {
    try {
      const meta = await sharp(input.data).metadata();
      if (!meta.width || !meta.height) {
        throw new AttachmentError(
          "Image has invalid dimensions or could not be decoded.",
          "IMAGE_CORRUPTED",
        );
      }
      const pixels = meta.width * meta.height;
      if (pixels > this.imageLimits.maxImagePixels) {
        throw new AttachmentError(
          `Image total pixels (${pixels}) exceeds maximum allowed (${this.imageLimits.maxImagePixels}).`,
          "DIMENSIONS_EXCEEDED",
        );
      }
      if (
        meta.width > this.imageLimits.maxImageDimension ||
        meta.height > this.imageLimits.maxImageDimension
      ) {
        throw new AttachmentError(
          `Image dimensions (${meta.width}x${meta.height}) exceed maximum allowed (${this.imageLimits.maxImageDimension}px).`,
          "DIMENSIONS_EXCEEDED",
        );
      }
    } catch (err) {
      if (err instanceof AttachmentError) throw err;
      throw new AttachmentError(
        `Failed to parse image bytes: ${err instanceof Error ? err.message : String(err)}`,
        "IMAGE_CORRUPTED",
      );
    }
  }

  async saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef> {
    await this.validateImage(input);

    // 1. Process & normalize with Sharp
    // Rotate handles EXIF orientation and strips metadata
    const pipeline = sharp(input.data).rotate();
    const meta = await pipeline.metadata();
    const origWidth = meta.width ?? 0;
    const origHeight = meta.height ?? 0;

    // Normalization bounds (2048 x 2048 total pixel budget, 8192 long edge)
    const MAX_PIXELS = 2048 * 2048;
    const currentPixels = origWidth * origHeight;
    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (currentPixels > MAX_PIXELS && origWidth > 0 && origHeight > 0) {
      const scale = Math.sqrt(MAX_PIXELS / currentPixels);
      targetWidth = Math.max(1, Math.round(origWidth * scale));
      targetHeight = Math.max(1, Math.round(origHeight * scale));
      pipeline.resize(targetWidth, targetHeight, { fit: "inside" });
    }

    const hasAlpha = Boolean(meta.hasAlpha);
    const mediaType: ImageMediaType = hasAlpha ? "image/webp" : "image/jpeg";

    let normalizedBuffer: Buffer;
    if (hasAlpha) {
      normalizedBuffer = await pipeline.webp({ quality: 85 }).toBuffer();
    } else {
      normalizedBuffer = await pipeline
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    }

    // 2. Compute SHA-256 hash of normalized bytes
    const hash = crypto
      .createHash("sha256")
      .update(normalizedBuffer)
      .digest("hex");
    const attachmentId = AttachmentId(hash);
    const key = this.imageObjectKey(attachmentId);

    // 3. Fast Deduplication: Check if already stored in R2
    let exists = false;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: normalizedBuffer,
          ContentType: mediaType,
          CacheControl: "public, max-age=31536000, immutable",
          Metadata: {
            width: String(targetWidth),
            height: String(targetHeight),
            "original-name": encodeURIComponent(input.name || ""),
          },
        }),
      );
    }

    const wasDownscaled =
      targetWidth !== origWidth || targetHeight !== origHeight;

    return {
      attachmentId,
      mediaType,
      bytes: normalizedBuffer.byteLength,
      width: targetWidth,
      height: targetHeight,
      originalDimensions: wasDownscaled
        ? { width: origWidth, height: origHeight }
        : undefined,
      name: input.name,
    };
  }

  /**
   * Resolve a receipt id to the object it names.
   *
   * Images and files live under different prefixes but share the id space, so
   * both are probed; the HEAD response carries the length and the display name
   * the object was written with.
   */
  override async resolveReceipt(
    attachmentId: AttachmentId,
    signal?: AbortSignal,
  ): Promise<AttachmentRef | null> {
    try {
      const imageHead = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: this.imageObjectKey(attachmentId),
        }),
        { abortSignal: signal },
      );
      const mediaType = imageHead.ContentType ?? "application/octet-stream";
      const name = decodeURIComponent(
        imageHead.Metadata?.["original-name"] ?? "",
      );
      const width = Number(imageHead.Metadata?.width ?? 0) || undefined;
      const height = Number(imageHead.Metadata?.height ?? 0) || undefined;
      const imageRef: ImageAttachmentRef = {
        attachmentId,
        mediaType: mediaType as ImageMediaType,
        bytes: imageHead.ContentLength ?? 0,
        width: width ?? 0,
        height: height ?? 0,
        ...(name ? { name } : {}),
      };
      return imageRef;
    } catch {
      // Not an image; try the file prefix.
    }

    try {
      const fileHead = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: this.fileObjectKey(attachmentId),
        }),
        { abortSignal: signal },
      );
      const stored = decodeURIComponent(
        fileHead.Metadata?.["original-name"] ?? "",
      );
      return {
        attachmentId,
        name: stored || `file-${attachmentId.slice(0, 12)}`,
        bytes: fileHead.ContentLength ?? 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Delete the object behind a ref. Images and files use different prefixes.
   */
  override async deleteAttachment(ref: AttachmentRef): Promise<boolean> {
    const key = isImageAttachmentRef(ref)
      ? this.imageObjectKey(ref.attachmentId)
      : this.fileObjectKey(ref.attachmentId);

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  override async saveFile(
    input: SaveFileAttachment,
  ): Promise<FileAttachmentRef> {
    const hash = crypto.createHash("sha256").update(input.data).digest("hex");
    const attachmentId = AttachmentId(hash);
    const key = this.fileObjectKey(attachmentId);

    let exists = false;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: input.data,
          ContentType: input.mediaType || "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
          Metadata: input.name
            ? { "original-name": encodeURIComponent(input.name) }
            : undefined,
        }),
      );
    }

    return {
      attachmentId,
      name: input.name || `file-${hash.slice(0, 12)}`,
      bytes: input.data.byteLength,
    };
  }


  override async saveVideo(
    input: SaveVideoAttachment,
  ): Promise<VideoAttachmentRef> {
    const hash = crypto.createHash("sha256").update(input.data).digest("hex");
    const attachmentId = AttachmentId(hash);
    const key = this.fileObjectKey(attachmentId);

    let exists = false;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: input.data,
          ContentType: input.mediaType || "video/mp4",
          CacheControl: "public, max-age=31536000, immutable",
          Metadata: input.name
            ? { "original-name": encodeURIComponent(input.name) }
            : undefined,
        }),
      );
    }

    return {
      attachmentId,
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      name: input.name || `video-${hash.slice(0, 12)}.mp4`,
    };
  }

  override async saveFileStream(
    input: SaveFileStreamAttachment,
  ): Promise<FileAttachmentRef> {
    const chunks: Uint8Array[] = [];
    const hashStream = crypto.createHash("sha256");
    let totalBytes = 0;

    for await (const chunk of input.data) {
      input.signal?.throwIfAborted();
      chunks.push(chunk);
      hashStream.update(chunk);
      totalBytes += chunk.byteLength;
    }

    const fullBuffer = Buffer.concat(chunks);
    const hash = hashStream.digest("hex");
    const attachmentId = AttachmentId(hash);
    const key = this.fileObjectKey(attachmentId);

    let exists = false;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: fullBuffer,
          ContentType: input.mediaType || "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
          Metadata: input.name
            ? { "original-name": encodeURIComponent(input.name) }
            : undefined,
        }),
      );
    }

    return {
      attachmentId,
      name: input.name || `file-${hash.slice(0, 12)}`,
      bytes: totalBytes,
    };
  }

  // ─── Read Operations ────────────────────────────────────────────────────

  async readImage(
    ref: ImageAttachmentRef,
    signal?: AbortSignal,
  ): Promise<StoredAttachment<ImageAttachmentRef>> {
    signal?.throwIfAborted();
    const key = this.imageObjectKey(ref.attachmentId);

    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
        { abortSignal: signal },
      );

      if (!response.Body) {
        throw new AttachmentError(
          `Image ${ref.attachmentId} has no body in storage.`,
          "ATTACHMENT_NOT_FOUND",
        );
      }

      const bytes = await response.Body.transformToByteArray();

      // Verify checksum
      const actualHash = crypto
        .createHash("sha256")
        .update(bytes)
        .digest("hex");
      const expectedHash = attachmentIdToHex(ref.attachmentId);

      if (actualHash !== expectedHash) {
        throw new AttachmentError(
          `Integrity mismatch for ${ref.attachmentId}: expected ${expectedHash}, got ${actualHash}`,
          "INTEGRITY_MISMATCH",
        );
      }

      return { ref, data: bytes };
    } catch (err) {
      if (err instanceof AttachmentError) throw err;
      throw new AttachmentError(
        `Failed to read image ${ref.attachmentId} from R2: ${err instanceof Error ? err.message : String(err)}`,
        "STORAGE_ERROR",
      );
    }
  }

  override async *readFileStream(
    ref: FileAttachmentRef,
    signal?: AbortSignal,
  ): AsyncIterable<Uint8Array> {
    signal?.throwIfAborted();
    const key = this.fileObjectKey(ref.attachmentId);

    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
        { abortSignal: signal },
      );

      if (!response.Body) {
        throw new AttachmentError(
          `File ${ref.attachmentId} not found in storage.`,
          "ATTACHMENT_NOT_FOUND",
        );
      }

      const stream = response.Body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) {
        signal?.throwIfAborted();
        yield chunk;
      }
    } catch (err) {
      if (err instanceof AttachmentError) throw err;
      throw new AttachmentError(
        `Failed to stream file ${ref.attachmentId} from R2: ${err instanceof Error ? err.message : String(err)}`,
        "STORAGE_ERROR",
      );
    }
  }

  // ─── Delivery / Resolution ──────────────────────────────────────────────

  /**
   * Read object metadata for one attachment without downloading its body.
   * Tries the image key first, then the file key. Returns null when neither
   * object exists.
   */
  async headAttachment(
    attachmentId: AttachmentId,
  ): Promise<R2AttachmentHead | null> {
    const candidates: Array<{ kind: "image" | "file"; key: string }> = [
      { kind: "image", key: this.imageObjectKey(attachmentId) },
      { kind: "file", key: this.fileObjectKey(attachmentId) },
    ];

    for (const candidate of candidates) {
      try {
        const response = await this.client.send(
          new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: candidate.key,
          }),
        );
        return {
          kind: candidate.kind,
          contentType: response.ContentType,
          bytes: response.ContentLength,
          metadata: response.Metadata,
        };
      } catch (error) {
        if (isNotFoundError(error)) continue;
        throw new AttachmentError(
          `Failed to inspect ${attachmentId} in R2: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "STORAGE_ERROR",
        );
      }
    }

    return null;
  }

  /**
   * Open one stored attachment body for the delivery route, optionally
   * requesting an HTTP byte range. Streams the body instead of buffering it.
   */
  async openAttachmentObject(
    attachmentId: AttachmentId,
    options: { range?: string; signal?: AbortSignal } = {},
  ): Promise<R2StreamedObject | null> {
    const candidates = [
      this.imageObjectKey(attachmentId),
      this.fileObjectKey(attachmentId),
    ];

    for (const key of candidates) {
      try {
        const response = await this.client.send(
          new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            ...(options.range ? { Range: options.range } : {}),
          }),
          { abortSignal: options.signal },
        );
        if (!response.Body) continue;
        return {
          body: response.Body as unknown as AsyncIterable<Uint8Array>,
          contentType: response.ContentType,
          contentLength: response.ContentLength,
          contentRange: response.ContentRange,
          acceptRanges: response.AcceptRanges,
        };
      } catch (error) {
        if (isNotFoundError(error)) continue;
        throw new AttachmentError(
          `Failed to open ${attachmentId} from R2: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "STORAGE_ERROR",
        );
      }
    }

    return null;
  }

  // ─── Model Request Projection (Low Latency Turn Execution) ──────────────

  async readImageRequest(
    ref: ImageAttachmentRef,
    target: ImageRequestTarget,
    signal?: AbortSignal,
  ): Promise<RequestImageAttachment> {
    signal?.throwIfAborted();

    // Deterministic variant key for caching
    const variantRaw = `${ref.attachmentId}:${target.width ?? 0}x${target.height ?? 0}:${target.maxBytes ?? 0}`;
    const variantHash = crypto
      .createHash("sha256")
      .update(variantRaw)
      .digest("hex");
    const variantId = ImageVariantId(`variant-${variantHash.slice(0, 32)}`);

    // 1. Check local ephemeral cache (<1ms)
    const cached = this.requestCache.get(variantId);
    if (cached) return cached;

    // 2. Fetch original normalized image
    const stored = await this.readImage(ref, signal);

    // 3. Resize with Sharp according to target
    let pipeline = sharp(stored.data);
    const meta = await pipeline.metadata();
    let currentWidth = meta.width ?? ref.width;
    let currentHeight = meta.height ?? ref.height;

    if (target.width || target.height) {
      pipeline = pipeline.resize({
        width: target.width,
        height: target.height,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const hasAlpha = Boolean(meta.hasAlpha);
    const outMediaType: ImageMediaType = hasAlpha ? "image/webp" : "image/jpeg";

    let outBuffer: Buffer;
    if (hasAlpha) {
      outBuffer = await pipeline.webp({ quality: 80 }).toBuffer();
    } else {
      outBuffer = await pipeline.jpeg({ quality: 80 }).toBuffer();
    }

    const updatedMeta = await sharp(outBuffer).metadata();
    currentWidth = updatedMeta.width ?? currentWidth;
    currentHeight = updatedMeta.height ?? currentHeight;

    const result: RequestImageAttachment = {
      variantId,
      attachment: ref,
      data: outBuffer,
      mediaType: outMediaType,
      width: currentWidth,
      height: currentHeight,
      bytes: outBuffer.byteLength,
      depth: "uchar",
      space: "srgb",
      hasAlpha,
    };

    // 4. Save to ephemeral local cache for future turns
    this.requestCache.set(variantId, result);

    return result;
  }

  // ─── Public Edge URL Mapping ────────────────────────────────────────────

  getPublicUrl(ref: AttachmentRef): string {
    const hash = attachmentIdToHex(ref.attachmentId);
    if (this.cdnBaseUrl) {
      return `${this.cdnBaseUrl}/attachments/${ref.attachmentId}`;
    }
    return `/api/attachments/${ref.attachmentId}`;
  }

  // ─── Client Presigned Direct Upload ─────────────────────────────────────

  /**
   * Generates a presigned PUT URL allowing clients to upload directly to R2,
   * completely bypassing Next.js server memory and bandwidth.
   */
  async createPresignedUploadUrl(options: {
    expectedSha256Hex: string;
    mediaType: string;
    expiresInSeconds?: number;
    kind?: "image" | "file";
  }): Promise<PresignedUploadResult> {
    const attachmentId = AttachmentId(options.expectedSha256Hex);
    const key =
      options.kind === "file"
        ? this.fileObjectKey(attachmentId)
        : this.imageObjectKey(attachmentId);
    const expiresIn = options.expiresInSeconds ?? 900; // 15 mins default

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: options.mediaType,
      CacheControl: "public, max-age=31536000, immutable",
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn,
    });

    return {
      uploadUrl,
      attachmentId,
      key,
      expiresInSeconds: expiresIn,
    };
  }
}

/**
 * Creates an R2AttachmentStore reading credentials from standard environment variables:
 * - CLOUDFLARE_R2_ACCOUNT_ID / R2_ACCOUNT_ID
 * - CLOUDFLARE_R2_ACCESS_KEY_ID / R2_ACCESS_KEY_ID
 * - CLOUDFLARE_R2_SECRET_ACCESS_KEY / R2_SECRET_ACCESS_KEY
 * - CLOUDFLARE_R2_BUCKET_NAME / R2_BUCKET_NAME
 * - CLOUDFLARE_R2_PUBLIC_URL / R2_PUBLIC_URL / NEXT_PUBLIC_MEDIA_URL (optional)
 */
export function createR2StoreFromEnv(): R2AttachmentStore {
  const accountId =
    process.env.CLOUDFLARE_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const accessKeyId =
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
    process.env.R2_SECRET_ACCESS_KEY;
  const bucketName =
    process.env.CLOUDFLARE_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME;
  const cdnBaseUrl =
    process.env.CLOUDFLARE_R2_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_MEDIA_URL;
  const keyRoot =
    process.env.CLOUDFLARE_R2_KEY_ROOT || process.env.R2_KEY_ROOT || "";

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      "Missing Cloudflare R2 environment variables. Required: CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME",
    );
  }

  return new R2AttachmentStore({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    cdnBaseUrl,
    keyRoot,
  });
}
