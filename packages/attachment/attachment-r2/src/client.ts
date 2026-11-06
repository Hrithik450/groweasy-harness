import type { Config } from "./types";
import { S3Client } from "@aws-sdk/client-s3";

export function createR2Client(config: Config): S3Client {
  const endpoint =
    config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: false,
  });
}
