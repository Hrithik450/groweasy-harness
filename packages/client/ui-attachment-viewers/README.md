---
description: "Presentation-only image, video, and audio viewers plus the message attachment slot."
kind: "package-reference"
---

# @openai-harness/client-ui-attachment-viewers

## Summary

The app's image, video, and audio viewers, moved out of
`src/components/{image,video,audio}` unchanged in markup and styling. The
package is presentation-only: it never imports the application's modal store,
the image lightbox component, or any `@/` alias.

It contributes one slot entry, `conversation.chat.message.attachments`
(single, `session-maybe`), which renders the same media rail the chat turn
view uses: videos first, then audio, then the image gallery. A chat owner
declares that seat as a child slot; the plugin waits for the declaration with
`ctx.slots.inject`.

## Public surface

- `./client` — `apply(ctx)`, `MESSAGE_ATTACHMENTS_SLOT`,
  `MessageAttachments` and its owner props.
- Viewers — `GenerativeUIImage` (system image), `UserImageGallery` /
  `UserImageItem`, `VideoPlayer` (system video), `UserVideoViewer`,
  `AudioPlayer` (system audio), `UserAudioViewer`.
- Helpers — aspect-ratio tables and normalizers, duration/aspect parsing.
- Lightbox seam — `AttachmentLightboxContext` /
  `useAttachmentLightbox`. A host that owns the lightbox provides
  `openLightbox(images, index)`; without a provider the viewers remain
  presentation-only (clicking is a no-op).

## Deliberate omissions

- `src/components/modals/image.lightbox.modal.tsx` and the modal store stay
  app-side; this package owns no lightbox UI.
- No slot registration for assistant text, tool calls, or markdown.
