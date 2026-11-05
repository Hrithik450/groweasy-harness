/**
 * Pre-resolution of canonical image blocks into provider-ready bytes.
 *
 * The wire mappers stay synchronous and pure: the drivers await
 * {@link encodeImages} once per request and pass the resulting map into the
 * mapper. Storage is a host concern supplied through {@link LoadRequestImage},
 * and every failure is best-effort: an unreadable image degrades to its text
 * envelope instead of failing the whole turn.
 *
 * @module @openai-harness/llm-openai/images
 */

import type {
  ImageAttachmentRef,
  ImageMediaType,
  RequestImageAttachment,
} from "@openai-harness/attachment";
import type { Message } from "@openai-harness/llm";

/** At most this many images are attached to one provider request. */
export const MAX_REQUEST_IMAGES = 10;

/** Provider-independent request-image target used for multimodal input. */
export const REQUEST_IMAGE_TARGET = Object.freeze({
  width: 1568,
  height: 1568,
  maxBytes: 3_500_000,
});

/** One image encoded for a provider's wire format. */
export interface EncodedRequestImage {
  mediaType: ImageMediaType;
  base64: string;
  bytes: number;
  width: number;
  height: number;
}

/** Encoded images keyed by durable attachment id. */
export type EncodedImageMap = ReadonlyMap<string, EncodedRequestImage>;

/**
 * Injectable loader for request images.
 *
 * The provider package has no storage dependency, so the host supplies this
 * callback (typically resolving the tenant's attachment store). When absent,
 * images are left as their text envelope.
 */
export type LoadRequestImage = (
  ref: ImageAttachmentRef,
  tenantId?: string,
) => Promise<RequestImageAttachment | null>;

/**
 * Whether the routed model accepts image input. Unknown models are treated as
 * text-only so a turn never fails because of an unsupported content part.
 */
export function modelAcceptsImages(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (normalized.length === 0) return false;
  if (normalized.startsWith("deepseek")) return false;
  return (
    normalized.startsWith("gpt-4o") ||
    normalized.startsWith("gpt-4.1") ||
    normalized.startsWith("gpt-5") ||
    // The harness' default route; without this every image block degrades to
    // its text envelope and the model never sees the picture.
    normalized.startsWith("gpt-6") ||
    /^o\d/.test(normalized) ||
    /^o[-_]/.test(normalized)
  );
}

/**
 * Collect unique image references from user and tool messages. Assistant
 * images are never replayed, and system images are not a valid wire part.
 */
export function collectImageRefs(
  messages: readonly Message[],
  maxImages: number = MAX_REQUEST_IMAGES,
): ImageAttachmentRef[] {
  const refs: ImageAttachmentRef[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role === "assistant" || message.role === "system") continue;
    if (typeof message.content === "string") continue;

    for (const block of message.content) {
      if (block.type !== "image") continue;
      const id = block.ref.attachmentId;
      if (seen.has(id)) continue;
      seen.add(id);
      refs.push(block.ref);
      if (refs.length >= maxImages) return refs;
    }
  }

  return refs;
}

export interface EncodeImagesOptions {
  model: string;
  /** Owning tenant passed to the loader so a host can resolve tenant storage. */
  tenantId?: string;
  /** Host-injected loader; when absent, images are not encoded. */
  loadImage?: LoadRequestImage;
  maxImages?: number;
}

/**
 * Resolve image blocks to encoded request bytes for one model call.
 *
 * Images beyond the cap, from non-image models, or that fail to load are
 * simply absent from the returned map; the wire mapper then emits their text
 * envelope.
 */
export async function encodeImages(
  messages: readonly Message[],
  options: EncodeImagesOptions,
): Promise<EncodedImageMap> {
  if (!modelAcceptsImages(options.model)) return new Map();

  const refs = collectImageRefs(
    messages,
    options.maxImages ?? MAX_REQUEST_IMAGES,
  );
  const encoded = new Map<string, EncodedRequestImage>();

  for (const ref of refs) {
    try {
      const image = options.loadImage
        ? await options.loadImage(ref, options.tenantId)
        : null;
      if (!image) continue;
      encoded.set(ref.attachmentId, {
        mediaType: image.mediaType,
        base64: Buffer.from(image.data).toString("base64"),
        bytes: image.bytes,
        width: image.width,
        height: image.height,
      });
    } catch {
      // Leave the image's text envelope in place; never throw the turn away.
    }
  }

  return encoded;
}

/** Build one `data:` URL from an encoded image. */
export function encodedImageDataUrl(image: EncodedRequestImage): string {
  return `data:${image.mediaType};base64,${image.base64}`;
}
