/**
 * Configuration and result types for the Cloudflare R2 attachment driver.
 *
 * @module @/lib/attachments/drivers/r2/types
 */

import type { AttachmentId } from "@/lib/attachments/core";

/** Credentials and bucket settings for one R2 client. */
export interface R2Config {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucketName: string;
  /** Key prefix inside the bucket, e.g. `harness/prod`. */
  readonly keyRoot?: string;
  /** Override for testing or non-standard R2 endpoints. */
  readonly endpoint?: string;
  /** Public CDN base used when building attachment URLs. */
  readonly cdnBaseUrl?: string;
}

/** Details returned to a browser for a direct-to-R2 upload. */
export interface PresignedUploadResult {
  readonly uploadUrl: string;
  readonly attachmentId: AttachmentId;
  readonly key: string;
  readonly expiresInSeconds: number;
}

/** Head metadata for one stored attachment object. */
export interface R2AttachmentHead {
  /** Which content-addressed key namespace held the object. */
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
