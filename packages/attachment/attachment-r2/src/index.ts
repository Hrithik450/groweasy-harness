/**
 * Cloudflare R2-backed attachment store (`ctx.attachments`).
 *
 * The store is content-addressed and tenant-scoped by the `namespace` the host
 * supplies; credentials, bucket identity, namespace and admission limits all
 * arrive through {@link Config}. The store class reads neither the environment
 * nor app code, so it serves Next.js routes, gateway processes and tests. The
 * package's tenant registry and host facade are re-exported below.
 *
 * @module @openai-harness/attachment-r2
 */

import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import sharp from "sharp";
import {
  AttachmentError,
  AttachmentId,
  AttachmentStore,
  DEFAULT_IMAGE_LIMITS,
  attachmentIdToHex,
  ImageVariantId,
  type AttachmentRef,
  type FileAttachmentRef,
  type ImageAttachmentLimits,
  type ImageAttachmentRef,
  type ImageMediaType,
  type ImageRequestTarget,
  type RequestImageAttachment,
  type SaveFileAttachment,
  type SaveFileStreamAttachment,
  type SaveImageAttachment,
  type StoredAttachment,
} from "@openai-harness/attachment";
import { createR2Client } from "./client";
import { EphemeralRequestCache } from "./cache";
import type {
  Config,
  PresignedUploadResult,
  R2AttachmentHead,
  R2StreamedObject,
} from "./types";

export * from "./types";
export { createR2Client } from "./client";
export { EphemeralRequestCache } from "./cache";
export { getGlobalObjectBuffer } from "./objects";
export * from "./registry";
export * from "./host";

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

/** Persistent content-addressed Cloudflare R2 attachment store. */
export class R2AttachmentStore extends AttachmentStore {
  static Config: z<Config> = z.object({
    accountId: z.string().required(),
    accessKeyId: z.string().required(),
    secretAccessKey: z.string().required(),
    bucketName: z.string().required(),
    namespace: z.string(),
    cdnBaseUrl: z.string(),
    endpoint: z.string(),
    maxImageBytes: z
      .number()
      .step(1)
      .min(1)
      .default(DEFAULT_IMAGE_LIMITS.maxImageBytes),
    maxImagesPerMessage: z
      .number()
      .step(1)
      .min(1)
      .default(DEFAULT_IMAGE_LIMITS.maxImagesPerMessage),
    maxMessageImageBytes: z
      .number()
      .step(1)
      .min(1)
      .default(DEFAULT_IMAGE_LIMITS.maxMessageImageBytes),
    maxImagePixels: z
      .number()
      .step(1)
      .min(1)
      .default(DEFAULT_IMAGE_LIMITS.maxImagePixels),
    maxImageDimension: z
      .number()
      .step(1)
      .min(1)
      .default(DEFAULT_IMAGE_LIMITS.maxImageDimension),
  });

  readonly client: S3Client;
  readonly bucketName: string;
  readonly cdnBaseUrl?: string;
  readonly namespace: string;
  readonly imageLimits: ImageAttachmentLimits;
  private readonly requestCache: EphemeralRequestCache;

  constructor(ctx: Context, config: Config) {
    super(ctx);
    this.bucketName = config.bucketName;
    this.cdnBaseUrl = config.cdnBaseUrl?.replace(/\/+$/, "");
    this.namespace = normalizeNamespace(config.namespace);
    this.imageLimits = Object.freeze({
      maxImageBytes: config.maxImageBytes ?? DEFAULT_IMAGE_LIMITS.maxImageBytes,
      maxImagesPerMessage:
        config.maxImagesPerMessage ?? DEFAULT_IMAGE_LIMITS.maxImagesPerMessage,
      maxMessageImageBytes:
        config.maxMessageImageBytes ?? DEFAULT_IMAGE_LIMITS.maxMessageImageBytes,
      maxImagePixels:
        config.maxImagePixels ?? DEFAULT_IMAGE_LIMITS.maxImagePixels,
      maxImageDimension:
        config.maxImageDimension ?? DEFAULT_IMAGE_LIMITS.maxImageDimension,
      mediaTypes: DEFAULT_IMAGE_LIMITS.mediaTypes,
    });
    this.requestCache = new EphemeralRequestCache(this.namespace);
    this.client = createR2Client(config);
  }

  /** Prefix every key with the store namespace, if one is configured. */
  private key(relative: string): string {
    return this.namespace ? `${this.namespace}/${relative}` : relative;
  }

  private imageObjectKey(attachmentId: AttachmentId): string {
    const hash = attachmentIdToHex(attachmentId);
    return this.key(`attachments/v1/objects/${hash.slice(0, 2)}/${hash}`);
  }

  private fileObjectKey(attachmentId: AttachmentId): string {
    const hash = attachmentIdToHex(attachmentId);
    return this.key(`attachments/v1/file-objects/${hash.slice(0, 2)}/${hash}`);
  }

  private requestVariantKey(variantId: ImageVariantId): string {
    const hash = attachmentIdToHex(variantId);
    return this.key(`attachments/v1/cache/request-images/${hash.slice(0, 2)}/${hash}`);
  }

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

    const pipeline = sharp(input.data).rotate();
    const meta = await pipeline.metadata();
    const origWidth = meta.width ?? 0;
    const origHeight = meta.height ?? 0;

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

    const hash = crypto
      .createHash("sha256")
      .update(normalizedBuffer)
      .digest("hex");
    const attachmentId = AttachmentId(hash);
    const key = this.imageObjectKey(attachmentId);

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
            ...(input.metadata ?? {}),
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
          Metadata: {
            ...(input.metadata ?? {}),
            "original-name": encodeURIComponent(input.name || ""),
          },
        }),
      );
    }

    return {
      attachmentId,
      name: input.name || `file-${hash.slice(0, 12)}`,
      bytes: input.data.byteLength,
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
          Metadata: {
            ...(input.metadata ?? {}),
            "original-name": encodeURIComponent(input.name || ""),
          },
        }),
      );
    }

    return {
      attachmentId,
      name: input.name || `file-${hash.slice(0, 12)}`,
      bytes: totalBytes,
    };
  }

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

  override async readImageRequest(
    ref: ImageAttachmentRef,
    target: ImageRequestTarget,
    signal?: AbortSignal,
  ): Promise<RequestImageAttachment> {
    signal?.throwIfAborted();

    const variantRaw = `${ref.attachmentId}:${target.width ?? 0}x${target.height ?? 0}:${target.maxBytes ?? 0}`;
    const variantHash = crypto
      .createHash("sha256")
      .update(variantRaw)
      .digest("hex");
    const variantId = ImageVariantId(`sha256:${variantHash}`);

    const cached = this.requestCache.get(variantId);
    if (cached) return cached;

    const stored = await this.readImage(ref, signal);

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

    this.requestCache.set(variantId, result);

    return result;
  }

  /**
   * Read object metadata for one attachment without downloading its body.
   * Tries the image key first, then the file key. Returns null when neither
   * object exists inside this store's namespace.
   */
  async headAttachment(
    attachmentId: AttachmentId,
  ): Promise<R2AttachmentHead | null> {
    const candidates: Array<{
      kind: "image" | "file";
      key: string;
    }> = [
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

  /**
   * Delete both key variants for one content-addressed attachment. Delete is
   * idempotent, so missing keys are ignored. Scoped strictly to this store's
   * namespace by the key builders.
   */
  async deleteAttachment(attachmentId: AttachmentId): Promise<void> {
    for (const key of [
      this.imageObjectKey(attachmentId),
      this.fileObjectKey(attachmentId),
    ]) {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
    }
  }

  /**
   * Derive the delivery URL for one durable reference. Falls back to the
   * authenticated application route when no CDN base URL is configured.
   */
  getPublicUrl(ref: AttachmentRef): string {
    if (this.cdnBaseUrl) {
      return `${this.cdnBaseUrl}/attachments/${ref.attachmentId}`;
    }
    return `/api/attachments/${ref.attachmentId}`;
  }

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
    const expiresIn = options.expiresInSeconds ?? 900;

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
 * Normalize and validate an object-key namespace.
 *
 * Empty/undefined means "no prefix". A non-empty namespace may contain `/`
 * separators but no leading/trailing slash, empty segment, `.`, or `..`.
 */
export function normalizeNamespace(namespace?: string): string {
  const normalized = (namespace ?? "").replace(/^\/+|\/+$/g, "");
  if (!normalized) return "";
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    ) ||
    !/^[A-Za-z0-9._/-]+$/.test(normalized)
  ) {
    throw new Error(`Invalid R2 object namespace: "${namespace}".`);
  }
  return normalized;
}

export default R2AttachmentStore;

export * from "@openai-harness/attachment";
