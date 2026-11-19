/**
 * Canonical content blocks projected onto Chat Completions wire values: text
 * flattening, image parts, and the envelope that carries a tool's images.
 *
 * @module @/lib/llm/llm/chat-completions/content
 */

import type { ContentBlock, ToolCallBlock } from "@/lib/llm/llm/message";
import {
  encodedImageDataUrl,
  type EncodedImageMap,
} from "@/lib/llm/llm-openai/images";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessage,
  ChatCompletionToolCall,
} from "./wire-types";

/** Project rich content blocks to the text the provider wire accepts. */
export function blocksToText(blocks: readonly ContentBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        parts.push(block.text);
        break;
      case "block":
        parts.push(`[Rendered UI Block: ${block.spec.root}]`);
        break;
      case "image": {
        const alt = block.alt ? ` (${block.alt})` : "";
        parts.push(`[Image attachment id="${block.ref.attachmentId}"${alt}]`);
        break;
      }
      case "video": {
        const alt = block.alt ? ` (${block.alt})` : "";
        parts.push(`[Video attachment id="${block.ref.attachmentId}"${alt}]`);
        break;
      }
      case "file": {
        const filename = block.filename ? ` (${block.filename})` : "";
        parts.push(
          `[File attachment id="${block.ref.attachmentId}"${filename}]`,
        );
        break;
      }
      case "tool-call":
      case "reasoning":
        // Tool calls map separately; reasoning is not replayed.
        break;
    }
  }

  return parts.join("\n\n").trim();
}

/** Collect assistant tool-call blocks in model order. */
export function toolCallsFrom(
  blocks: readonly ContentBlock[],
): ChatCompletionToolCall[] {
  return blocks
    .filter((block): block is ToolCallBlock => block.type === "tool-call")
    .map((block) => ({
      id: String(block.id),
      type: "function",
      function: { name: block.name, arguments: block.arguments },
    }));
}

/** Render blocks to text while dropping images that have encoded bytes. */
export function textWithoutEncodedImages(
  blocks: readonly ContentBlock[],
  encodedImages: EncodedImageMap | undefined,
): string {
  if (!encodedImages || encodedImages.size === 0) return blocksToText(blocks);
  return blocksToText(
    blocks.filter(
      (block) =>
        !(
          block.type === "image" &&
          encodedImages.has(block.ref.attachmentId)
        ),
    ),
  );
}

/** Project encodable image blocks to provider content parts. */
export function imageContentParts(
  blocks: readonly ContentBlock[],
  encodedImages: EncodedImageMap | undefined,
): ChatCompletionContentPart[] {
  if (!encodedImages || encodedImages.size === 0) return [];
  const parts: ChatCompletionContentPart[] = [];

  for (const block of blocks) {
    if (block.type !== "image") continue;
    const image = encodedImages.get(block.ref.attachmentId);
    if (!image) continue;
    parts.push({
      type: "image_url",
      image_url: { url: encodedImageDataUrl(image), detail: "auto" },
    });
  }

  return parts;
}

export function toolResultImageEnvelope(
  callId: string,
  count: number,
): string {
  const noun = count === 1 ? "image" : "images";
  return `<tool-result-images call_id="${callId}">${count} ${noun} returned by this tool call.</tool-result-images>`;
}

/** Map one canonical message to zero or more Chat Completions messages. */
