import { AttachmentError } from "./errors";
import { brandString, type Branded } from "@openai-harness/brand";

/**
 * Opaque content-addressed identifier for an immutable attachment object.
 * Guaranteed to be in the format "sha256:<64-character-hex>".
 */
export type AttachmentId = Branded<"AttachmentId">;

const SHA256_PREFIX_REGEX = /^sha256:[a-f0-9]{64}$/i;
const SHA256_BARE_REGEX = /^[a-f0-9]{64}$/i;

/**
 * Validates and brands an AttachmentId.
 * Accepts either bare 64-char hex or "sha256:<64-char-hex>".
 * Normalizes to lowercase "sha256:<hex>".
 */
export function AttachmentId(value: string): AttachmentId {
  const trimmed = value.trim().toLowerCase();
  if (SHA256_PREFIX_REGEX.test(trimmed)) {
    return brandString<AttachmentId>(trimmed);
  }
  if (SHA256_BARE_REGEX.test(trimmed)) {
    return brandString<AttachmentId>(`sha256:${trimmed}`);
  }
  throw new AttachmentError(
    `Invalid AttachmentId format: "${value}". Expected "sha256:<64-hex-chars>".`,
    "STORAGE_ERROR",
  );
}

/**
 * Extracts the 64-character hex hash from an AttachmentId.
 */
export function attachmentIdToHex(id: AttachmentId | string): string {
  return id.startsWith("sha256:") ? id.slice(7) : id;
}

/**
 * Opaque deterministic identity for a model-request image transformation variant.
 */
export type ImageVariantId = Branded<"ImageVariantId">;

/**
 * Brand a validated request-image transformation identifier.
 */
export function ImageVariantId(value: string): ImageVariantId {
  return brandString<ImageVariantId>(value);
}
