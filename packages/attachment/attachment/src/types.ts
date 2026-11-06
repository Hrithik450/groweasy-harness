import type { AttachmentId, ImageVariantId } from "./brand";

export type { AttachmentId, ImageVariantId };
export {
  AttachmentId as createAttachmentId,
  attachmentIdToHex,
  ImageVariantId as createImageVariantId,
} from "./brand";

/** Raster image formats accepted by the version-one attachment path. */
export type ImageMediaType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

/** Video formats accepted by the attachment path. */
export type VideoMediaType = "video/mp4" | "video/webm" | "video/quicktime";

/** Durable, serializable reference to one immutable video. */
export interface VideoAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId;
  /** Media type verified from the stored bytes. */
  mediaType: VideoMediaType;
  /** Exact byte length. */
  bytes: number;
  /** Intrinsic video frame width in pixels, if detectable. */
  width?: number;
  /** Intrinsic video frame height in pixels, if detectable. */
  height?: number;
  /** Video duration in seconds, if detectable. */
  duration?: number;
  /** Optional display name stripped of local path information. */
  name?: string;
}

/** Durable, serializable reference to one immutable normalized image. */
export interface ImageAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId;
  /** Media type verified from the stored bytes. */
  mediaType: ImageMediaType;
  /** Exact encoded byte length. */
  bytes: number;
  /** Intrinsic encoded width in pixels. */
  width: number;
  /** Intrinsic encoded height in pixels. */
  height: number;
  /** Optional display name stripped of local path information. */
  name?: string;
  /**
   * Input dimensions after applying EXIF orientation and before normalization
   * scaling. Present only when normalization reduced the image.
   */
  originalDimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Durable, serializable reference to one verbatim stored file. Files are
 * stored byte-for-byte with no normalization; `attachmentId` is the sha256
 * digest of exactly those bytes.
 */
export interface FileAttachmentRef {
  /** Opaque content-addressed storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId;
  /** Sanitized display filename, also the stored object's leaf name. */
  name: string;
  /** Exact byte length. */
  bytes: number;
}

/**
 * Union of all durable, serializable attachment references.
 * Stored directly in session messages and events.
 */
export type AttachmentRef =
  | ImageAttachmentRef
  | VideoAttachmentRef
  | FileAttachmentRef;

/**
 * Narrows any attachment reference to an image reference.
 *
 * Structural check: image references carry an `image/*` media type.
 */
export function isImageAttachmentRef(
  ref: AttachmentRef,
): ref is ImageAttachmentRef {
  return "mediaType" in ref && ref.mediaType.startsWith("image/");
}

/**
 * Narrows any attachment reference to a video reference.
 *
 * Structural check: video references carry a `video/*` media type.
 */
export function isVideoAttachmentRef(
  ref: AttachmentRef,
): ref is VideoAttachmentRef {
  return "mediaType" in ref && ref.mediaType.startsWith("video/");
}

/**
 * Narrows any attachment reference to a file reference.
 *
 * Structural check: file references have no media type at all.
 */
export function isFileAttachmentRef(
  ref: AttachmentRef,
): ref is FileAttachmentRef {
  return !("mediaType" in ref);
}

/** Base64-encoded file upload accompanying one wire request. */
export interface EncodedFileAttachment {
  /** Canonical base64 encoding of the file bytes. */
  data: string;
  /** Optional display name; it is never interpreted as a path. */
  name?: string;
}

/** Request to durably commit one file verbatim. */
export interface SaveFileAttachment {
  data: Uint8Array;
  /** Optional caller-declared media type. */
  mediaType?: string;
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string;
  /** Optional caller metadata stored on the object (retention hints, provenance). */
  metadata?: Record<string, string>;
}

/** Request to durably commit one file from bounded byte chunks. */
export interface SaveFileStreamAttachment {
  /** Exact file bytes in order; providers must not retain the complete sequence in memory. */
  data: AsyncIterable<Uint8Array>;
  /** Optional caller-declared media type. */
  mediaType?: string;
  /** Optional cancellation for source reads and storage writes. */
  signal?: AbortSignal;
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string;
  /** Optional caller metadata stored on the object (retention hints, provenance). */
  metadata?: Record<string, string>;
}

/** Deployment-resolved limits used by upload admission and request buffering. */
export interface ImageAttachmentLimits {
  maxImageBytes: number;
  maxImagesPerMessage: number;
  maxMessageImageBytes: number;
  maxImagePixels: number;
  /** Maximum intrinsic width and maximum intrinsic height in pixels for one image. */
  maxImageDimension: number;
  mediaTypes: readonly ImageMediaType[];
}

/** Deployment-resolved limits used by video upload admission and validation. */
export interface VideoAttachmentLimits {
  maxVideoBytes: number;
  mediaTypes: readonly VideoMediaType[];
}

/** Base64-encoded image upload accompanying one wire request. */
export interface EncodedImageAttachment {
  /** Declared media type, verified against the decoded bytes during admission. */
  mediaType: ImageMediaType;
  /** Canonical base64 encoding of the image bytes. */
  data: string;
  /** Optional display name; it is never interpreted as a path. */
  name?: string;
}

/** Base64-encoded video upload accompanying one wire request. */
export interface EncodedVideoAttachment {
  /** Declared media type, verified against the decoded bytes during admission. */
  mediaType: VideoMediaType;
  /** Canonical base64 encoding of the video bytes. */
  data: string;
  /** Optional display name; it is never interpreted as a path. */
  name?: string;
}

/**
 * Browser-submitted prompt content accepted by Host prompt endpoints; the
 * accepting Host promotes image and video parts to durable references through
 * admission before any message is created, so a wire caller can
 * never cite an attachment it did not upload.
 */
export type PromptContentPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "image";
      readonly mediaType: ImageMediaType;
      readonly data: string;
      readonly name?: string;
    }
  | {
      readonly type: "video";
      readonly mediaType: VideoMediaType;
      readonly data: string;
      readonly name?: string;
    };

/** Host prompt content whose file receipts are resolved and whose image bytes await admission. */
export type AttachmentAdmissionPart =
  | PromptContentPart
  | { readonly type: "file"; readonly attachment: FileAttachmentRef }
  | { readonly type: "video"; readonly attachment: VideoAttachmentRef };

/** Host-admitted prompt content with every attachment represented by its durable reference. */
export type AdmittedPromptContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly attachment: ImageAttachmentRef }
  | { readonly type: "video"; readonly attachment: VideoAttachmentRef }
  | { readonly type: "file"; readonly attachment: FileAttachmentRef };

/** Request to validate and durably commit one video. */
export interface SaveVideoAttachment {
  data: Uint8Array;
  /** Caller-declared media type, checked against decoded bytes. */
  mediaType: VideoMediaType;
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string;
}

/** Request to durably commit one video from bounded byte chunks. */
export interface SaveVideoStreamAttachment {
  /** Exact video bytes in order; providers must not retain the complete sequence in memory. */
  data: AsyncIterable<Uint8Array>;
  /** Caller-declared media type, checked against stream header. */
  mediaType?: VideoMediaType;
  /** Optional cancellation for source reads and storage writes. */
  signal?: AbortSignal;
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string;
}

/** Stored video bytes returned after reference and digest verification. */
export interface StoredVideoAttachment {
  ref: VideoAttachmentRef;
  data: Uint8Array;
}

/** Request to validate and durably commit one image. */
export interface SaveImageAttachment {
  data: Uint8Array;
  /** Caller-declared media type, checked against fully decoded bytes. */
  mediaType: ImageMediaType;
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string;
  /** Optional caller metadata stored on the object (retention hints, provenance). */
  metadata?: Record<string, string>;
}

/** Stored image bytes returned after reference and digest verification. */
export interface StoredImageAttachment {
  ref: ImageAttachmentRef;
  data: Uint8Array;
}

/** Generic stored attachment holder. */
export interface StoredAttachment<TRef extends AttachmentRef = AttachmentRef> {
  ref: TRef;
  data: Uint8Array;
}

/** Deterministic request-image target selected by one exact model route for one attachment. */
export interface ImageRequestTarget {
  /** Target width in pixels; a target above the source keeps the source width. */
  width: number;
  /** Target height in pixels; a target above the source keeps the source height. */
  height: number;
  /** Encoded-byte target before base64 expansion or Files API upload. */
  maxBytes: number;
}

/** Cached request version derived from one provider-independent normalized attachment. */
export interface RequestImageAttachment {
  /** Cache and upload-index key over the attachment id, policy, and fixed encoder parameters. */
  variantId?: ImageVariantId;
  /** Durable normalized attachment from which this request version was derived. */
  attachment?: ImageAttachmentRef;
  /** Encoded request bytes. */
  data: Uint8Array;
  mediaType: ImageMediaType;
  bytes: number;
  width: number;
  height: number;
  depth?: "uchar";
  space?: "srgb";
  hasAlpha?: boolean;
}
