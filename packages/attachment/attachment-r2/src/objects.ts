/**
 * Bucket-wide object access for prefixes that are not tenant-scoped.
 *
 * {@link R2AttachmentStore} owns everything under one tenant namespace. Some
 * assets belong to the deployment instead — the shared voice catalog, for
 * example — and live at a fixed prefix such as `harness/audio-previews/`.
 * Those callers need the same credentials and endpoint without a tenant, so
 * this module is the single place that resolves them.
 *
 * @module @openai-harness/attachment-r2/objects
 */

import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createR2Client } from "./client";
import { r2ConfigFromEnv } from "./registry";

/** Memoized client: one S3 connection pool per process. */
let client: S3Client | null = null;
let bucketName: string | null = null;

/** Resolve the shared client and bucket from the deployment environment. */
function connection(): { client: S3Client; bucketName: string } {
  if (client === null || bucketName === null) {
    const config = r2ConfigFromEnv();
    client = createR2Client(config);
    bucketName = config.bucketName;
  }
  return { client, bucketName };
}

/** True when an S3 error means the key is absent rather than unreachable. */
function isMissingKey(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}

/**
 * Read one object from a bucket-wide prefix.
 *
 * @param key full object key, including its deployment prefix.
 * @returns the object bytes, or `null` when the key does not exist.
 */
export async function getGlobalObjectBuffer(key: string): Promise<Buffer | null> {
  const { client: s3, bucketName: bucket } = connection();
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return bytes === undefined ? null : Buffer.from(bytes);
  } catch (error) {
    if (isMissingKey(error)) return null;
    throw error;
  }
}
