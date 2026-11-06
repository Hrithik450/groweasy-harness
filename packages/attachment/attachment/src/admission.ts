import { Buffer } from "node:buffer";
import { AttachmentError } from "./errors";
import type { AttachmentStore } from "./contract";
import type {
  EncodedFileAttachment,
  EncodedImageAttachment,
  EncodedVideoAttachment,
  FileAttachmentRef,
  ImageAttachmentLimits,
  ImageAttachmentRef,
  ImageMediaType,
  SaveImageAttachment,
  VideoAttachmentRef,
} from "./types";

export const DEFAULT_IMAGE_LIMITS: ImageAttachmentLimits = Object.freeze({
  maxImageBytes: 20 * 1024 * 1024,
  maxImagesPerMessage: 20,
  maxMessageImageBytes: 100 * 1024 * 1024,
  maxImagePixels: 64_000_000,
  maxImageDimension: 8192,
  mediaTypes: Object.freeze([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ] as const),
});

/**
 * Validates aggregate batch constraints before committing any member.
 */
export function validateImageBatchLimits(
  inputs: readonly SaveImageAttachment[],
  limits: ImageAttachmentLimits = DEFAULT_IMAGE_LIMITS,
): void {
  if (inputs.length > limits.maxImagesPerMessage) {
    throw new AttachmentError(
      `Image batch (${inputs.length}) exceeds maximum allowed images per message (${limits.maxImagesPerMessage}).`,
      "TOO_MANY_IMAGES",
    );
  }

  const totalBytes = inputs.reduce((sum, img) => sum + img.data.byteLength, 0);
  if (totalBytes > limits.maxMessageImageBytes) {
    throw new AttachmentError(
      `Total image size (${(totalBytes / (1024 * 1024)).toFixed(1)}MB) exceeds aggregate limit (${(limits.maxMessageImageBytes / (1024 * 1024)).toFixed(1)}MB).`,
      "IMAGES_TOO_LARGE",
    );
  }

  for (const input of inputs) {
    if (input.data.byteLength > limits.maxImageBytes) {
      throw new AttachmentError(
        `Image "${input.name || "unnamed"}" (${(input.data.byteLength / (1024 * 1024)).toFixed(1)}MB) exceeds maximum size (${(limits.maxImageBytes / (1024 * 1024)).toFixed(1)}MB).`,
        "IMAGE_TOO_LARGE",
      );
    }

    if (input.mediaType && !limits.mediaTypes.includes(input.mediaType as ImageMediaType)) {
      throw new AttachmentError(
        `Media type "${input.mediaType}" is not supported. Allowed: ${limits.mediaTypes.join(", ")}.`,
        "UNSUPPORTED_IMAGE_TYPE",
      );
    }
  }
}

/**
 * Decode one upload payload while rejecting non-canonical base64 forms, so a
 * wire caller cannot smuggle a second interpretation of the same bytes.
 */
function decodeCanonicalBase64(
  data: string,
  empty: "reject" | "accept",
  code: "INVALID_IMAGE_BASE64" | "INVALID_FILE_BASE64" | "INVALID_VIDEO_BASE64",
): Uint8Array {
  const decoded = Buffer.from(data, "base64");
  if ((data.length === 0 && empty === "reject") || decoded.toString("base64") !== data) {
    throw new AttachmentError(
      code === "INVALID_IMAGE_BASE64"
        ? "Image upload is not canonical base64."
        : code === "INVALID_VIDEO_BASE64"
          ? "Video upload is not canonical base64."
          : "File upload is not canonical base64.",
      code,
    );
  }
  return new Uint8Array(decoded);
}

/**
 * Admit one wire image batch: enforce canonical base64 on every member, then
 * delegate batch admission to {@link AttachmentStore.saveImages}.
 */
export async function admitEncodedImages(
  attachments: AttachmentStore,
  images: readonly EncodedImageAttachment[],
): Promise<readonly ImageAttachmentRef[]> {
  return attachments.saveImages(
    images.map((image): SaveImageAttachment => ({
      data: decodeCanonicalBase64(image.data, "reject", "INVALID_IMAGE_BASE64"),
      mediaType: image.mediaType,
      ...(image.name === undefined ? {} : { name: image.name }),
    })),
  );
}

/**
 * Admit one wire file upload: enforce canonical base64 (an empty file is a
 * valid zero-byte payload), then delegate verbatim commit to saveFile.
 */
export async function admitEncodedFile(
  attachments: AttachmentStore,
  file: EncodedFileAttachment,
): Promise<FileAttachmentRef> {
  return attachments.saveFile({
    data: decodeCanonicalBase64(file.data, "accept", "INVALID_FILE_BASE64"),
    ...(file.name === undefined ? {} : { name: file.name }),
  });
}

/**
 * Admit one wire video upload: enforce canonical base64, then delegate commit
 * to saveVideo.
 */
export async function admitEncodedVideo(
  attachments: AttachmentStore,
  video: EncodedVideoAttachment,
): Promise<VideoAttachmentRef> {
  return attachments.saveVideo({
    data: decodeCanonicalBase64(video.data, "reject", "INVALID_VIDEO_BASE64"),
    mediaType: video.mediaType,
    ...(video.name === undefined ? {} : { name: video.name }),
  });
}
