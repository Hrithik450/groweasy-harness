import type { Session } from "@openai-harness/session";
import fs from "fs";
import path from "path";
import { materializeAttachment, saveAttachment } from "@openai-harness/attachment-r2";
import { resolveVoiceId } from "../utils";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface ConvertAccentArgs {
  inputPath: string;
  voiceId: string;
  storage: "tmp" | "artifact";
  stability?: number;
  similarityBoost?: number;
  style?: number;
  removeBackgroundNoise?: boolean;
}

export interface ConvertAccentResult {
  attachmentUrl: string;
  voiceId: string;
  bytes: number;
  mediaType: string;
}

export async function executeConvertAccent(
  args: ConvertAccentArgs,
  userId?: string,
): Promise<ConvertAccentResult> {
  const inputPathRaw = (args.inputPath || "").trim();
  if (!inputPathRaw) {
    throw new Error("inputPath is required (e.g. /api/attachments/...)");
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY environment variable is required for voice conversion.",
    );
  }

  if (!userId) {
    throw new Error("convertAccent requires an authenticated tenant.");
  }

  const processInputPath = await materializeAttachment(inputPathRaw, userId);
  const voiceId = resolveVoiceId((args.voiceId ?? "").trim());

  const fileBuffer = fs.readFileSync(processInputPath);
  const filename = path.basename(processInputPath);
  const ext = path.extname(processInputPath).toLowerCase();
  const mimeType = ext === ".wav" ? "audio/wav" : "audio/mpeg";

  const rawStability = args.stability;
  const rawSimilarity = args.similarityBoost;
  const rawStyle = args.style;
  const rawRemoveBg = args.removeBackgroundNoise;

  const stability =
    typeof rawStability === "number"
      ? Math.max(0, Math.min(1, rawStability))
      : 1.0;
  const similarityBoost =
    typeof rawSimilarity === "number"
      ? Math.max(0, Math.min(1, rawSimilarity))
      : 1.0;
  const style =
    typeof rawStyle === "number" ? Math.max(0, Math.min(1, rawStyle)) : 0.0;
  const removeBackgroundNoise =
    rawRemoveBg !== undefined ? Boolean(rawRemoveBg) : false;

  const formData = new FormData();
  const fileBlob = new Blob([fileBuffer], { type: mimeType });
  formData.append("audio", fileBlob, filename);
  formData.append("model_id", "eleven_multilingual_sts_v2");
  formData.append(
    "remove_background_noise",
    removeBackgroundNoise ? "true" : "false",
  );
  formData.append(
    "voice_settings",
    JSON.stringify({
      stability,
      similarity_boost: similarityBoost,
      style,
      use_speaker_boost: true,
    }),
  );

  const stsUrl = `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}/stream`;
  const stsRes = await fetch(stsUrl, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!stsRes.ok) {
    const errText = await stsRes.text().catch(() => "");
    throw new Error(
      `ElevenLabs STS failed (HTTP ${stsRes.status}): ${errText}`,
    );
  }

  const arrayBuf = await stsRes.arrayBuffer();
  const outputBuffer = Buffer.from(arrayBuf);

  const saved = await saveAttachment({
    buffer: outputBuffer,
    filename: `sts_${voiceId}_${filename}`,
    mediaType: "audio/mpeg",
    storage: args.storage || "tmp",
    userId,
  });

  return {
    attachmentUrl: saved.url,
    voiceId,
    bytes: outputBuffer.length,
    mediaType: "audio/mpeg",
  };
}

export const convertAccentTool = defineTool({
  name: "convertAccent",
  description:
    "Speech-to-Speech accent and voice conversion. Transforms an input audio track's vocal tone and accent into an authentic required persona with 100% clone fidelity without hallucinating.",
  timeoutMs: 90000,
  isConcurrencySafe: () => true,
  parameters: {
    inputPath: {
      type: "string",
      required: true,
      description:
        "Attachment id (`sha256:<hex>`) or '/api/attachments/<attachmentId>' URL of the input audio file (.mp3, .wav) to convert.",
    },
    voiceId: {
      type: "string",
      required: true,
      description:
        "Target voice ID from the 'listVoiceCatalog' tool (e.g. '1pAo3XuopqND1XIDGKB4', 'karan', etc.).",
    },
    storage: {
      type: "string",
      required: true,
      enum: ["tmp", "artifact"],
      description:
        "Storage tier: 'tmp' (default) for intermediate takes; 'artifact' for permanent deliverables.",
    },
    stability: {
      type: "number",
      description:
        "Speech-to-Speech stability (0.0 - 1.0). Default 1.0 (100%) to lock down source pacing, tone, and inflection without drift or hallucination.",
    },
    similarityBoost: {
      type: "number",
      description:
        "Voice clone similarity boost (0.0 - 1.0). Default 1.0 (100%) for exact end-to-end voice clone timbre match.",
    },
    removeBackgroundNoise: {
      type: "boolean",
      description:
        "Whether to remove background noise. Defaults to false so background audio/voice is preserved and not re-filtered.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        attachmentUrl: { type: "string", required: true },
        voiceId: { type: "string", required: true },
        bytes: { type: "number", required: true },
        mediaType: { type: "string", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ attachmentUrl: value.attachmentUrl }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "execute",
    title: `Convert accent -> ${args.voiceId}`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: `Accent converted: ${(result.meta as any)?.attachmentUrl ?? ""}`,
    content: result.content,
  }),
  async execute(args, exec) {
    const result = await executeConvertAccent(args, toolSession<Session>(exec).userId);
    const summary = `Voice converted successfully to persona '${result.voiceId}'. Output saved to: ${result.attachmentUrl} (${Math.round(result.bytes / 1024)} KB)`;
    return {
      attachmentUrl: result.attachmentUrl,
      voiceId: result.voiceId,
      bytes: result.bytes,
      mediaType: result.mediaType,
      summary,
    };
  },
});
