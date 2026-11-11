"use client";

/**
 * User-message chat node.
 *
 * Renders one human input as the brand bubble plus the video/audio/image rail
 * recovered from its Markdown, byte-identical to the app's turn view.
 *
 * @module @openai-harness/client-ui-chat/client/UserMessageNode
 */

import type { MessageAttachmentsOwnerProps } from "@openai-harness/client-ui-attachment-viewers/client";
import { UserImageGallery } from "@openai-harness/client-ui-attachment-viewers/client";
import { UserAudioViewer } from "@openai-harness/client-ui-attachment-viewers/client";
import { UserVideoViewer } from "@openai-harness/client-ui-attachment-viewers/client";
import type { ChatNodeOwnerProps } from "./types";
import { parseUserMessageMedia } from "./media";

/** Default media rail used when no attachment entry occupies the seat. */
export function InlineMessageMedia({
  images,
  videos,
  audios,
}: MessageAttachmentsOwnerProps) {
  return (
    <>
      {videos !== undefined && videos.length > 0 && (
        <div className="flex flex-col items-end gap-2 w-full">
          {videos.map((video, index) => (
            <UserVideoViewer
              key={`user-vid-${index}`}
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
              key={`user-aud-${index}`}
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
    </>
  );
}

/**
 * Render one user input.
 * @param props - the owning turn plus the bound user-node owner props.
 * @returns the aligned input row, or null when the node carries no input.
 */
export function UserMessageNode({ input }: ChatNodeOwnerProps) {
  if (input === undefined) return null;

  const { images, videos, audios, text } = parseUserMessageMedia(input.content);

  return (
    <div
      id={input.id}
      className="flex justify-end w-full min-w-0"
    >
      <div className="max-w-[85%] sm:max-w-[75%] min-w-0 flex flex-col items-end gap-2">
        <InlineMessageMedia
          images={images}
          videos={videos.map((video) => ({
            src: video.src,
            title: video.name,
          }))}
          audios={audios.map((audio) => ({
            src: audio.src,
            title: audio.name,
          }))}
        />

        {text && (
          <div className="w-fit max-w-full bg-brand text-primary-foreground px-4 py-2.5 rounded-none font-normal text-[14.5px] leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}
