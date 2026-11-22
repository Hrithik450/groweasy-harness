/**
 * Prompt a user sends when they build an ad from a saved idea.
 *
 * Client-safe: no filesystem or registry access, so UI components can import
 * this module without pulling the server-only prompt compiler into the bundle.
 *
 * @module @/lib/prompts/idea
 */

import type { Idea } from "@/lib/detail.bar/types";

/** Prompt carrying the idea card's full context into the ad build turn. */
export function buildIdeaPrompt(idea: Idea): string {
  const lines = [
    `Create the ad for the saved idea "${idea.title}".`,
    `Source: ${idea.source}`,
    `Concept: ${idea.description}`,
  ];

  if (idea.hook) lines.push(`Hook: ${idea.hook}`);
  if (idea.makeFor) lines.push(`Audience: ${idea.makeFor}`);
  if (idea.why) lines.push(`Why it should work: ${idea.why}`);
  if (idea.format) {
    lines.push(
      `Format: ${idea.format}${idea.aspectRatio ? ` · ${idea.aspectRatio}` : ""}`,
    );
  }

  if (idea.mediaUrl) {
    lines.push(
      `Reference ad: ${idea.mediaUrl}`,
      "Open the reference before designing. Keep its structure; replace every asset and every word with ours.",
    );
  } else {
    lines.push("No reference ad: build the concept from the idea alone.");
  }
  if (idea.sourceUrl) lines.push(`Reference source: ${idea.sourceUrl}`);

  lines.push(
    idea.format === "video"
      ? "Use the video-ad skill."
      : idea.format === "image"
        ? "Use the static-ad skill."
        : "Use the static-ad or video-ad skill, whichever fits the concept.",
    "Produce one finished ad, save it with updateCreatives, then show it in a <ui-block> with one short line on the concept and the design choices.",
  );

  return lines.join("\n");
}
