"use client";

/**
 * Lightbox seam for presentation-only attachment viewers.
 *
 * The viewers never import the application's modal store or modal component.
 * A host that owns a lightbox provides one through
 * {@link AttachmentLightboxContext}; when no provider is present, clicking a
 * viewer keeps the exact same visual behaviour but performs no navigation.
 *
 * @module @openai-harness/client-ui-attachment-viewers
 */
import { createContext, useContext } from "react";

/** One image presented by a viewer or gallery. */
export interface MessageImage {
  src: string;
  alt?: string;
  aspectRatio?: string;
}

/** Host-provided image lightbox capability. */
export interface AttachmentLightbox {
  /**
   * Open a lightbox on one image.
   * @param images - the gallery the clicked image belongs to.
   * @param index - clicked image position.
   */
  openLightbox: (images: MessageImage[], index?: number) => void;
}

/** Optional capability; absent means the viewers are presentation-only. */
export const AttachmentLightboxContext =
  createContext<AttachmentLightbox | null>(null);

const NO_LIGHTBOX: AttachmentLightbox = { openLightbox: () => {} };

/**
 * Read the host lightbox capability.
 * @returns the host capability, or a no-op when no provider is installed.
 */
export function useAttachmentLightbox(): AttachmentLightbox {
  return useContext(AttachmentLightboxContext) ?? NO_LIGHTBOX;
}
