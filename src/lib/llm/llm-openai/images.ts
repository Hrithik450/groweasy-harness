/**
 * Encoded-image values used by the Chat Completions wire mapper.
 *
 * @module @/lib/llm/llm-openai/images
 */

/** One image already encoded for transport. */
export interface EncodedImage {
  readonly base64: string;
  readonly mediaType: string;
}

/** Attachment id to encoded image lookup. */
export type EncodedImageMap = Map<string, EncodedImage>;

/**
 * Builds the data URL expected by an `image_url` content part.
 *
 * @param image - the encoded image.
 * @returns a `data:` URL carrying the media type and base64 payload.
 */
export function encodedImageDataUrl(image: EncodedImage): string {
  return `data:${image.mediaType};base64,${image.base64}`;
}
