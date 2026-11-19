import fs from "fs";
import path from "path";
import {
  getAttachmentStore,
  materializeAttachment,
  toAttachmentReceipt,
  type AttachmentReceipt,
} from "@/lib/attachments/index";
import {
  executeFfmpeg,
  findFfmpegPath,
  probeMedia,
} from "@/lib/tools/composition/ffmpeg/probe";
import { uuidv7 } from "@/lib/utils/uuid";
import { getOpenAIClient } from "@/lib/core/agent";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export type CaptionStyle = "karaoke" | "pop" | "highlight";
export type HighlightColor = "yellow" | "cyan" | "green" | "orange" | "white";

const HIGHLIGHT_COLOR_CODES: Readonly<Record<HighlightColor, string>> = {
  yellow: "&H0000E6FF&",
  cyan: "&H00FFFF00&",
  green: "&H0033FF55&",
  orange: "&H000099FF&",
  white: "&H00FFFFFF&",
};

export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  words?: CaptionWord[];
}

export interface RenderCaptionsArgs {
  videoPath: string;
  position?: "chest" | "bottom" | "center";
  captions?: CaptionCue[];
  storage: "tmp" | "artifact";
}

export interface RenderCaptionsData {
  contentParts: Array<InputContentParam>;
}

export type RenderCaptionsInput = ToolInput<RenderCaptionsArgs>;
export type RenderCaptionsOutput = ToolOutput<RenderCaptionsData>;

export interface RenderCaptionsResult {
  attachment: AttachmentReceipt;
  cueCount: number;
}

export const renderCaptionsToolDefinition = {
  type: "function" as const,
  name: "render_captions",
  description:
    "Burn dynamic animated captions onto a video. Automatically transcribes dialogue with word-level timing.",
  parameters: {
    type: "object",
    properties: {
      videoPath: {
        type: "string",
        description:
          "Attachment URL (e.g. /api/attachments/...) of the input video (.mp4) to caption.",
      },
      position: {
        type: "string",
        enum: ["chest", "bottom", "center"],
        description:
          'Vertical placement: "chest" (55% height, recommended for 9:16 safe zone), "bottom", "center".',
      },
      storage: {
        type: "string",
        enum: ["tmp", "artifact"],
        description:
          "Storage tier: 'tmp' (default) for intermediate captioned cuts; 'artifact' for permanent deliverables.",
      },
    },
    required: ["videoPath", "storage"],
  },
};

export function formatAssTime(seconds: number): string {
  const totalSec = Math.max(0, seconds);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  const centis = Math.floor((totalSec % 1) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export function buildAssSubtitles(
  cues: CaptionCue[],
  width: number,
  height: number,
  style: CaptionStyle = "karaoke",
  highlightColor: HighlightColor = "yellow",
  position: "chest" | "bottom" | "center" = "chest",
): string {
  const activeColor =
    HIGHLIGHT_COLOR_CODES[highlightColor] || HIGHLIGHT_COLOR_CODES.yellow;
  const is916 = height > width;
  const fontSize = is916
    ? Math.round(width * 0.065)
    : Math.round(height * 0.055);

  let marginV = Math.round(height * 0.12);
  if (position === "chest") {
    marginV = Math.round(height * 0.42);
  } else if (position === "center") {
    marginV = Math.round(height * 0.48);
  }

  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Arial Black,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,1.5,0,1,3.5,1.5,2,40,40,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  for (const cue of cues) {
    const startStr = formatAssTime(cue.start);
    const endStr = formatAssTime(cue.end);

    if (style === "karaoke" && cue.words && cue.words.length > 0) {
      // Build syllable karaoke tags
      let karaokeText = "";
      for (const w of cue.words) {
        const durationCentis = Math.max(1, Math.round((w.end - w.start) * 100));
        karaokeText += `{\\k${durationCentis}}${w.word} `;
      }
      lines.push(
        `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,{\\c${activeColor}}${karaokeText.trim()}`,
      );
    } else {
      lines.push(
        `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${cue.text}`,
      );
    }
  }

  return lines.join("\n");
}

export async function executeRenderCaptions(
  args: RenderCaptionsArgs,
): Promise<RenderCaptionsResult> {
  const videoPathRaw = (
    args.videoPath ||
    ((args as unknown as Record<string, unknown>).video_path as string) ||
    ""
  ).trim();
  if (!videoPathRaw) throw new Error("videoPath is required");

  let videoResolved: string | null = null;
  try {
    videoResolved = await materializeAttachment(videoPathRaw);
  } catch {
    videoResolved = null;
  }
  const processVideoPath =
    videoResolved ?? (fs.existsSync(videoPathRaw) ? videoPathRaw : "");

  if (!fs.existsSync(processVideoPath)) {
    throw new Error(`Video file not found at ${videoPathRaw}`);
  }

  const probe = probeMedia(processVideoPath);
  const ffmpegBin = findFfmpegPath();
  const tempDir = path.join(
    process.cwd(),
    "data",
    "tmp",
    `captions_${Date.now()}_${uuidv7()}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const extractedWav = path.join(tempDir, "audio.wav");
  const assPath = path.join(tempDir, "captions.ass");
  const outputMp4 = path.join(tempDir, "captioned.mp4");

  try {
    const cues: CaptionCue[] = args.captions ? [...args.captions] : [];

    // 1. Transcribe audio if cues were not manually provided
    if (cues.length === 0) {
      await executeFfmpeg(
        [
          "-y",
          "-i",
          processVideoPath,
          "-vn",
          "-acodec",
          "pcm_s16le",
          "-ar",
          "16000",
          "-ac",
          "1",
          extractedWav,
        ],
        ffmpegBin,
      );

      const client = getOpenAIClient();
      if (!client) {
        throw new Error(
          "OpenAI client not configured for Whisper audio transcription.",
        );
      }

      const fileStream = fs.createReadStream(extractedWav);
      const transcription = (await client.audio.transcriptions.create({
        file: fileStream,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
      } as unknown as Parameters<
        typeof client.audio.transcriptions.create
      >[0])) as unknown as {
        words?: Array<{ word: string; start: number; end: number }>;
        text?: string;
      };

      if (transcription.words && transcription.words.length > 0) {
        // Group words into short dynamic 2-4 word bursts
        const WORDS_PER_CUE = 3;
        for (let i = 0; i < transcription.words.length; i += WORDS_PER_CUE) {
          const slice = transcription.words.slice(i, i + WORDS_PER_CUE);
          const start = slice[0].start;
          const end = slice[slice.length - 1].end;
          const text = slice.map((w) => w.word.trim()).join(" ");
          cues.push({
            start,
            end: Math.max(end, start + 0.6),
            text,
            words: slice.map((w) => ({
              word: w.word.trim(),
              start: w.start,
              end: w.end,
            })),
          });
        }
      } else if (transcription.text) {
        cues.push({
          start: 0,
          end: probe.duration || 4,
          text: transcription.text,
        });
      }
    }

    if (cues.length === 0) {
      cues.push({
        start: 0,
        end: probe.duration || 4,
        text: "",
      });
    }

    // 2. Generate ASS subtitle file
    const assContent = buildAssSubtitles(
      cues,
      probe.width || 1080,
      probe.height || 1920,
      "karaoke",
      "yellow",
      args.position || "chest",
    );
    fs.writeFileSync(assPath, assContent, "utf-8");

    // 3. Burn subtitles into video using FFmpeg
    await executeFfmpeg(
      [
        "-y",
        "-i",
        processVideoPath,
        "-vf",
        `subtitles=${assPath}:force_style='Alignment=2'`,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        outputMp4,
      ],
      ffmpegBin,
    );

    const captionedBuffer = fs.readFileSync(outputMp4);
    const ref = await getAttachmentStore().saveFile({
      data: captionedBuffer,
      mediaType: "video/mp4",
    });
    const attachment = toAttachmentReceipt(ref, "video/mp4", {
      storage: args.storage || "tmp",
    });

    return {
      attachment,
      cueCount: cues.length,
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function executeRenderCaptionsTool(
  input: RenderCaptionsInput,
): Promise<RenderCaptionsOutput> {
  try {
    const data = await executeRenderCaptions(input.args);
    const summary = `Dynamic karaoke captions burned successfully (${data.cueCount} cues). Output video: ${data.attachment.url}.`;
    return {
      success: true,
      data: {
        contentParts: [{ type: "input_text", text: summary }],
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [
          { type: "input_text", text: `Error rendering captions: ${errorMsg}` },
        ],
      },
      error: errorMsg,
    };
  }
}
