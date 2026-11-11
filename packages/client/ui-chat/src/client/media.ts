/**
 * User-message media extraction.
 *
 * The composer writes attachments as ordinary Markdown (`![id](url)` and
 * `[id](url)`), so the transcript recovers them from the message text. The
 * patterns and fallback labels are unchanged application behaviour.
 *
 * @module @openai-harness/client-ui-chat/client/media
 */

import type { ContentBlock } from "@openai-harness/llm";

/** Inline image syntax. */
export const USER_IMAGE_RE = /!\[(.*?)\]\((.*?)\)/g;
/** Inline video-link syntax. */
export const USER_VIDEO_RE =
  /\[(.*?)\]\((.*?.(\.mp4|\.mov|\.webm|\.m4v|\.avi|\.mkv))\)/gi;
/** Inline audio-link syntax. */
export const USER_AUDIO_RE =
  /\[(.*?)\]\((.*?.(\.mp3|\.wav|\.m4a|\.ogg|\.aac|\.flac))\)/gi;

/** One media link recovered from Markdown. */
export interface MediaLink {
  name: string;
  src: string;
}

/** One image recovered from Markdown. */
export interface UserImage {
  alt: string;
  src: string;
}

/** Collect every match of one media pattern. */
export function collectMediaLinks(
  text: string,
  pattern: RegExp,
  fallbackName: string,
): MediaLink[] {
  return Array.from(text.matchAll(pattern), (match) => ({
    name: match[1] || fallbackName,
    src: match[2],
  }));
}

/** The text blocks of one message, joined as the app does. */
export function textContentOf(content: readonly ContentBlock[]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n\n");
}

/** Media recovered from one user input. */
export interface UserMessageMedia {
  images: UserImage[];
  videos: MediaLink[];
  audios: MediaLink[];
  /** Message text without the media links. */
  text: string;
}

/** Extract images, videos, audio, and display text from one user input. */
export function parseUserMessageMedia(
  content: readonly ContentBlock[],
): UserMessageMedia {
  const raw = textContentOf(content);

  const images = Array.from(
    raw.matchAll(USER_IMAGE_RE),
    (match: RegExpMatchArray) => ({
      alt: match[1] || "Uploaded image",
      src: match[2],
    }),
  );
  const videos = collectMediaLinks(raw, USER_VIDEO_RE, "Uploaded video");
  const audios = collectMediaLinks(raw, USER_AUDIO_RE, "Uploaded audio");

  const text = raw
    .replace(USER_IMAGE_RE, "")
    .replace(USER_VIDEO_RE, "")
    .replace(USER_AUDIO_RE, "")
    .trim();

  return { images, videos, audios, text };
}
