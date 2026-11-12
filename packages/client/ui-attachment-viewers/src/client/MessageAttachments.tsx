"use client";

/**
 * Message attachment seat.
 *
 * Renders the user-message media rail (video, audio, then the image gallery)
 * exactly as the app's turn view does. The component owns presentation only:
 * images reach the lightbox through the optional
 * {@link AttachmentLightboxContext} provider.
 *
 * @module @openai-harness/client-ui-attachment-viewers
 */
import { UserAudioViewer } from "../UserAudioViewer";
import { UserImageGallery } from "../UserImageViewer";
import { UserVideoViewer } from "../UserVideoViewer";
import type { MessageImage } from "../lightbox";

/** One video attachment presented by the message rail. */
export interface MessageVideo {
  src: string;
  title?: string;
}

/** One audio attachment presented by the message rail. */
export interface MessageAudio {
  src: string;
  title?: string;
}

/** Owner props of the message attachment slot. */
export interface MessageAttachmentsOwnerProps {
  /** Images shown in the gallery (max three tiles, `+N` on the third). */
  images?: readonly MessageImage[];
  /** Videos shown above the audio/image rows. */
  videos?: readonly MessageVideo[];
  /** Audio attachments shown above the image row. */
  audios?: readonly MessageAudio[];
}

/**
 * Render the attachment rail for one chat message.
 * @param props - images, videos, and audio attachments.
 * @returns the media rail, or null when the message carries no attachments.
 */
export function MessageAttachments({
  images,
  videos,
  audios,
}: MessageAttachmentsOwnerProps) {
  const hasImages = images !== undefined && images.length > 0;
  const hasVideos = videos !== undefined && videos.length > 0;
  const hasAudios = audios !== undefined && audios.length > 0;
  if (!hasImages && !hasVideos && !hasAudios) return null;

  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      {videos !== undefined && videos.length > 0 && (
        <div className="flex flex-col items-end gap-2 w-full">
          {videos.map((video, index) => (
            <UserVideoViewer
              key={`message-video-${index}-${video.src}`}
              src={video.src}
              title={video.title}
            />
          ))}
        </div>
      )}

      {audios !== undefined && audios.length > 0 && (
        <div className="flex flex-col items-end gap-2 w-full">
          {audios.map((audio, index) => (
            <UserAudioViewer
              key={`message-audio-${index}-${audio.src}`}
              src={audio.src}
              title={audio.title}
            />
          ))}
        </div>
      )}

      {images !== undefined && images.length > 0 && (
        <div className="flex justify-end w-full">
          <UserImageGallery images={[...images]} />
        </div>
      )}
    </div>
  );
}
