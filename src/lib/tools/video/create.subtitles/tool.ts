/**
 * `createSubtitles` — timed lowercase `.ass` captions from a narration track.
 *
 * Runs entirely in-process: materialize the audio, transcribe it with OpenAI,
 * build 3–5 word cues, and store the `.ass` as an attachment.
 */

import fs from "node:fs";
import path from "node:path";
import {
  ensureScratchDir,
  getAttachmentStore,
  materializeAttachment,
  toAttachmentReceipt,
} from "@/lib/attachments";
import { getOpenAIClient } from "@/lib/core/agent/client";

export interface CreateSubtitlesArgs {
  audioPath: string;
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
      audioPath: {
        type: "string",
        description: "Attachment URL of the narration audio.",
      },
      language: {
        type: "string",
        description: "Spoken language (default English).",
      },
    },
    required: ["audioPath"],
  },
} as const;

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

function assTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.round((total % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
    Math.min(99, cs),
  ).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/[{}]/g, "").replace(/\n/g, " ");
}

/** Split one segment into 3–5 word cues, sharing its time evenly. */
function segmentCues(
  segment: TranscriptSegment,
): Array<{ start: number; end: number; text: string }> {
  const words = segment.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += 4) {
    groups.push(words.slice(i, i + 4));
  }

  const span = Math.max(0.1, segment.end - segment.start);
  const step = span / groups.length;
  return groups.map((group, i) => ({
    start: segment.start + step * i,
    end: segment.start + step * (i + 1),
    text: escapeAss(group.join(" ").toLowerCase()),
  }));
}

function buildAss(
  cues: Array<{ start: number; end: number; text: string }>,
): string {
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Arial,64,&H00FFFFFF,&H00FFFFFF,&H00481F0A,&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,60,60,120,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...cues.map(
      (cue) =>
        `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${cue.text}`,
    ),
    "",
  ].join("\n");
}

async function localAudio(
  audioPath: string,
): Promise<{ path: string; cleanup: boolean }> {
  if (!/^https?:\/\//i.test(audioPath)) {
    return { path: await materializeAttachment(audioPath), cleanup: false };
  }
  const res = await fetch(audioPath, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Audio download failed (HTTP ${res.status}).`);
  const dir = await ensureScratchDir();
  const target = path.join(dir, `subs_audio_${Date.now()}.mp3`);
  await fs.promises.writeFile(target, new Uint8Array(await res.arrayBuffer()));
  return { path: target, cleanup: true };
}

export async function executeCreateSubtitles(args: CreateSubtitlesArgs) {
  const client = getOpenAIClient();
  if (!client) throw new Error("OPENAI_API_KEY is required for subtitles.");

  const audioPath = args.audioPath?.trim();
  if (!audioPath) throw new Error("audioPath is required.");

  const audio = await localAudio(audioPath);
  try {
    const transcript = await client.audio.transcriptions.create({
      file: fs.createReadStream(audio.path),
      model: "whisper-1",
      response_format: "verbose_json",
      ...(args.language?.trim() ? { language: args.language.trim() } : {}),
    });

    const segments = (transcript.segments ?? []) as TranscriptSegment[];
    const cues = segments.flatMap(segmentCues);
    if (cues.length === 0)
      throw new Error("No speech was detected in the audio.");

    const data = new TextEncoder().encode(buildAss(cues));
    const name = "subtitles.ass";
    const ref = await getAttachmentStore().saveFile({
      data,
      mediaType: "text/plain",
      name,
    });
    return toAttachmentReceipt(ref, "text/plain", {
      filename: name,
    });
  } finally {
    if (audio.cleanup) await fs.promises.rm(audio.path, { force: true });
  }
}
