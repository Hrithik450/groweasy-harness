/**
 * Attachment error definitions with stable machine-readable codes.
 *
 * Codes are the routing contract across package and process boundaries, so
 * `isAttachmentError` recognizes their shape structurally rather than by
 * prototype: the store implementation lives in another package and may carry
 * its own copy of this module after a build.
 */

export type AttachmentErrorCode =
  | "TOO_MANY_IMAGES"
  | "IMAGES_TOO_LARGE"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "INVALID_IMAGE_BASE64"
  | "INVALID_FILE_BASE64"
  | "INVALID_VIDEO_BASE64"
  | "IMAGE_CORRUPTED"
  | "IMAGE_TOO_LARGE"
  | "DIMENSIONS_EXCEEDED"
  | "ATTACHMENT_NOT_FOUND"
  | "INTEGRITY_MISMATCH"
  | "STORAGE_UNSUPPORTED"
  | "STORAGE_ERROR";

const ATTACHMENT_ERROR_CODE_SET: ReadonlySet<string> = new Set<AttachmentErrorCode>([
  "TOO_MANY_IMAGES",
  "IMAGES_TOO_LARGE",
  "UNSUPPORTED_IMAGE_TYPE",
  "INVALID_IMAGE_BASE64",
  "INVALID_FILE_BASE64",
  "INVALID_VIDEO_BASE64",
  "IMAGE_CORRUPTED",
  "IMAGE_TOO_LARGE",
  "DIMENSIONS_EXCEEDED",
  "ATTACHMENT_NOT_FOUND",
  "INTEGRITY_MISMATCH",
  "STORAGE_UNSUPPORTED",
  "STORAGE_ERROR",
]);

export class AttachmentError extends Error {
  readonly code: AttachmentErrorCode;

  constructor(message: string, code: AttachmentErrorCode, options?: ErrorOptions) {
    super(message, options);
    this.name = "AttachmentError";
    this.code = code;
    Object.setPrototypeOf(this, AttachmentError.prototype);
  }
}

/**
 * Identify attachment failures by their stable code across package installs.
 */
export function isAttachmentError(error: unknown): error is AttachmentError {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    ATTACHMENT_ERROR_CODE_SET.has((error as { code: string }).code)
  );
}

/** Failure codes a caller can correct by changing the proposed image input. */
export const IMAGE_ADMISSION_ERROR_CODES: ReadonlySet<AttachmentErrorCode> =
  new Set<AttachmentErrorCode>([
    "TOO_MANY_IMAGES",
    "IMAGES_TOO_LARGE",
    "UNSUPPORTED_IMAGE_TYPE",
    "INVALID_IMAGE_BASE64",
    "IMAGE_CORRUPTED",
    "IMAGE_TOO_LARGE",
    "DIMENSIONS_EXCEEDED",
  ]);

export function isImageAdmissionError(error: unknown): boolean {
  return isAttachmentError(error) && IMAGE_ADMISSION_ERROR_CODES.has(error.code);
}
