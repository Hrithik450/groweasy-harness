import type { Session } from "@openai-harness/session";
import fs from "fs";
import { getOpenAIClient } from "@openai-harness/llm-openai";
import { materializeAttachment, saveAttachment } from "@openai-harness/attachment-r2";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

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

export function formatAssTime(seconds: number): string {
  const totalSec = Math.max(0, seconds);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  const centis = Math.floor((totalSec % 1) * 100);

  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  return `${hours}:${pad(minutes)}:${pad(secs)}.${pad(centis)}`;
}

export function buildAssContent(cues: CaptionCue[], marginV: number = 280): string {
  const header = `[Script Info]
Title: Generated Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Geist Mono,68,&H00FFFFFF,&H000000FF,&H00481F0A,&H80000000,-1,0,0,0,100,100,2,0,1,6,3,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines = cues.map((cue) => {
    const startStr = formatAssTime(cue.start);
    const endStr = formatAssTime(cue.end);
    const text = cue.text.toLowerCase();
    return `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${text}`;
  });

  return header + dialogueLines.join("\n") + "\n";
}

export const createSubtitlesTool = defineTool({
  name: "createSubtitles",
  description:
    "Prerequisite: video-ad or video-captions skill is a prerequisite.\n\n" +
    "Transcribes speech audio into precise millisecond timestamps via Whisper and compiles a styled .ass (Advanced SubStation Alpha) subtitle file with solid white text, thick dark navy border (#0a1f48 / &H00481F0A&), and strictly lowercase text. " +
    "Returns the .ass file attachment URL and full text content for downstream AI review and FFmpeg burning.",
  timeoutMs: 120000,
  isConcurrencySafe: () => true,
  parameters: {
    audioPath: {
      type: "string",
      required: true,
      description:
        "Attachment id (`sha256:<hex>`) or '/api/attachments/<attachmentId>' URL of the audio file (.mp3, .wav) to transcribe and subtitle.",
    },
    position: {
      type: "number",
      description:
        "Vertical placement as a percentage from the top edge (0 to 100, default: 60 for mobile safe zone).",
    },
    storage: {
      type: "string",
      required: true,
      enum: ["tmp", "artifact"],
      description:
        "Storage tier: 'tmp' (default) for intermediate drafts; 'artifact' for permanent deliverables.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        attachmentUrl: { type: "string", required: true },
        cueCount: { type: "number", required: true },
        textPreview: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: `Subtitles compiled successfully (${value.cueCount} cues). URL: ${value.attachmentUrl}\n\nPreview: ${value.textPreview}`,
      },
    ],
    presentationMeta: (_args, value) => ({ attachmentUrl: value.attachmentUrl, cueCount: value.cueCount }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "execute",
    title: "Create word-level subtitles (.ass)",
    locations: [{ path: args.audioPath }],
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: `Subtitles created: ${(result.meta as any)?.attachmentUrl ?? ""}`,
    content: result.content,
  }),
  async execute(args, exec) {
    const rawAudioPath = args.audioPath?.trim();
    if (!rawAudioPath) {
      throw new Error("Missing audioPath argument.");
    }

    const tenantId = toolSession<Session>(exec).userId;
    if (!tenantId) {
      throw new Error("createSubtitles requires an authenticated tenant.");
    }

    const localAudioPath = await materializeAttachment(rawAudioPath, tenantId);

    const client = getOpenAIClient();
    if (!client) {
      throw new Error("OpenAI client not configured.");
    }

    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(localAudioPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    const segments = (transcription as any).segments || [];
    const words = (transcription as any).words || [];

    const cues: CaptionCue[] = [];
    if (words.length > 0) {
      const CHUNK_SIZE = 4;
      for (let i = 0; i < words.length; i += CHUNK_SIZE) {
        const slice = words.slice(i, i + CHUNK_SIZE);
        const start = slice[0].start;
        const end = slice[slice.length - 1].end;
        const text = slice.map((w: any) => w.word.trim()).join(" ");
        cues.push({ start, end, text });
      }
    } else if (segments.length > 0) {
      for (const seg of segments) {
        cues.push({
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        });
      }
    } else {
      cues.push({
        start: 0,
        end: 5,
        text: transcription.text || "",
      });
    }

    const pos = args.position ?? 60;
    const marginV = Math.round(1920 * (1 - pos / 100));
    const assContent = buildAssContent(cues, marginV);

    const saved = await saveAttachment({
      buffer: Buffer.from(assContent, "utf-8"),
      filename: "subtitles.ass",
      mediaType: "text/x-ssa",
      storage: args.storage || "tmp",
      userId: tenantId,
    });

    return {
      attachmentUrl: saved.url,
      cueCount: cues.length,
      textPreview: cues.map((c) => c.text).slice(0, 5).join(" "),
    };
  },
});
