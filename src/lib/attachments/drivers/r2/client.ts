import type { R2Config } from "./types";
import { S3Client } from "@aws-sdk/client-s3";

export function createR2Client(config: R2Config): S3Client {
  const endpoint =
    config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Force path style is false for Cloudflare R2 standard endpoint
    forcePathStyle: false,
  });
}
