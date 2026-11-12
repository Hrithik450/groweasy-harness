/**
 * Browser attachment-viewer plugin.
 *
 * Contributes the message attachment rail into the chat message seat. Hosts
 * can also import the viewers directly; none of them reads an application
 * store or modal, so the package stays presentation-only.
 *
 * @module @openai-harness/client-ui-attachment-viewers/client
 */
import type { Context } from "@deepseek-ai/cordis";
// Loads the `ctx.slots` host contract from ui-renderer.
import type {} from "@openai-harness/client-ui-renderer/client";
import type {} from "@openai-harness/client-ui-slots";
import {
  MessageAttachments,
  type MessageAttachmentsOwnerProps,
} from "./MessageAttachments";

export type {
  MessageAttachmentsOwnerProps,
  MessageAudio,
  MessageVideo,
} from "./MessageAttachments";

export { UserImageGallery, UserImageItem } from "../UserImageViewer";
export type { UserImageItemProps } from "../UserImageViewer";
export { GenerativeUIImage } from "../SystemImageViewer";
export type { GenerativeUIImageProps } from "../SystemImageViewer";
export { UserVideoViewer } from "../UserVideoViewer";
export type { UserVideoViewerProps } from "../UserVideoViewer";
export { VideoPlayer } from "../SystemVideoViewer";
export type { VideoPlayerProps } from "../SystemVideoViewer";
export { UserAudioViewer } from "../UserAudioViewer";
export type { UserAudioViewerProps } from "../UserAudioViewer";
export { AudioPlayer } from "../SystemAudioViewer";
export type { AudioPlayerProps } from "../SystemAudioViewer";

export {
  AttachmentLightboxContext,
  useAttachmentLightbox,
  type AttachmentLightbox,
  type MessageImage,
} from "../lightbox";
export {
  ASPECT_CONFIG,
  getNearestAspectRatio,
  normalizeAspectRatio,
  type StandardAspectRatio,
} from "../image-utils";
export {
  formatDuration,
  getNearestAspectRatio as getNearestVideoAspectRatio,
  parseAspectRatio,
} from "../video-utils";

declare module "@openai-harness/client-ui-slots" {
  interface SlotMap {
    /**
     * The media rail inside one chat message. A chat owner must declare this
     * seat as a child slot (single, one rail per message); the plugin waits
     * for that declaration through `ctx.slots.inject`.
     */
    "conversation.chat.message.attachments": {
      kind: "single";
      scope: "session-maybe";
      owner: MessageAttachmentsOwnerProps;
    };
  }
}

/** Requires the renderer-owned slot service before registering. */
export const inject = ["slots"];

/** Slot key this package owns. */
export const MESSAGE_ATTACHMENTS_SLOT =
  "conversation.chat.message.attachments" as const;

/**
 * Register the message attachment rail when its slot is declared.
 * @param ctx - client context carrying `ctx.slots`.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject(MESSAGE_ATTACHMENTS_SLOT, () =>
    ctx.slots.register(
      {
        name: MESSAGE_ATTACHMENTS_SLOT,
        registrant: "@openai-harness/client-ui-attachment-viewers",
      },
      MessageAttachments,
    ),
  );
}
