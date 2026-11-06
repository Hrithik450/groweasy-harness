import type { AttachmentId } from "@openai-harness/attachment";

/**
 * Configuration for the R2-backed attachment store.
 *
 * Credentials and bucket identity are supplied by the host through this
 * config or Cordis plugin configuration. The store class never reads the
 * environment; the tenant registry (`registry.ts`) is the package's single
 * environment reader. Numeric limits fall back to the seam package defaults.
 */
export interface Config {
  /** Cloudflare account id owning the bucket. */
  accountId: string;
  /** S3-compatible access key id scoped to the bucket. */
  accessKeyId: string;
  /** S3-compatible secret access key scoped to the bucket. */
  secretAccessKey: string;
  /** Bucket holding every object this store reads or writes. */
  bucketName: string;
  /**
   * Optional key prefix owned by this store (for example
   * "openai-harness/t/<tenantId>"). Every object key this store writes or
   * reads is prefixed with it. Never include a leading or trailing slash.
   */
  namespace?: string;
  /**
   * Optional custom domain or Cloudflare Worker/CDN URL pointing to this
   * bucket. If omitted, `getPublicUrl` falls back to the authenticated
   * application route.
   */
  cdnBaseUrl?: string;
  /**
   * Optional custom S3 endpoint override (for testing with MinIO or
   * LocalStack). Defaults to
   * "https://<accountId>.r2.cloudflarestorage.com".
   */
  endpoint?: string;
  /** Maximum encoded bytes accepted for one submitted image. */
  maxImageBytes?: number;
  /** Maximum image count accepted in one submitted message. */
  maxImagesPerMessage?: number;
  /** Maximum aggregate encoded image bytes in one submitted message. */
  maxMessageImageBytes?: number;
  /** Maximum intrinsic width multiplied by height for one submitted image. */
  maxImagePixels?: number;
  /** Maximum intrinsic width and maximum intrinsic height for one image. */
  maxImageDimension?: number;
}

/** Backward-compatible name for {@link Config}. */
export type R2Config = Config;

export interface PresignedUploadResult {
  uploadUrl: string;
  attachmentId: AttachmentId;
  key: string;
  expiresInSeconds: number;
}

/** Head metadata for one stored attachment object. */
export interface R2AttachmentHead {
  kind: "image" | "file";
  contentType?: string;
  bytes?: number;
  metadata?: Record<string, string>;
}

/** Streamed object body plus the response metadata needed to serve it. */
export interface R2StreamedObject {
  body: AsyncIterable<Uint8Array>;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
  acceptRanges?: string;
}
