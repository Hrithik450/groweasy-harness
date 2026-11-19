/**
 * `createSubtitles` — OpenAI tool definition (this app's era).
 *
 * Builds a timed lowercase `.ass` track from an audio attachment and returns
 * its attachment URL; burning it in is a separate ffmpeg step.
 */

export interface CreateSubtitlesArgs {
  audioPath: string;
  storage?: "tmp" | "artifact";
  language?: string;
}

export const createSubtitlesToolDefinition = {
  type: "function" as const,
  name: "createSubtitles",
  description:
    "Transcribes an audio track and returns a timed lowercase .ass subtitle file " +
    "whose cues stay 3-5 words for mobile readability.",
  parameters: {
    type: "object",
    properties: {
      audioPath: { type: "string", description: "Attachment URL of the narration audio." },
      storage: { type: "string", enum: ["tmp", "artifact"] },
      language: { type: "string", description: "Spoken language (default English)." },
    },
    required: ["audioPath"],
  },
} as const;

export async function executeCreateSubtitles(args: CreateSubtitlesArgs) {
  const res = await fetch("/api/video/subtitles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const json = (await res.json()) as { data?: unknown; error?: string };
  if (!res.ok) throw new Error(json.error ?? `createSubtitles failed (HTTP ${res.status})`);
  return json.data;
}
