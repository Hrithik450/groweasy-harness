import fs from "fs";
import path from "path";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import {
  getAttachmentStore,
  materializeAttachment,
  toAttachmentReceipt,
  type AttachmentReceipt,
} from "@/lib/attachments/index";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { resolveVoiceId } from "../utils";

export const convertAccentToolDefinition = {
  type: "function" as const,
  name: "convertAccent",
  description:
    "Speech-to-Speech accent and voice conversion. Transforms an input audio track's vocal tone and accent into an authentic required persona with 100% clone fidelity without hallucinating.",
  parameters: {
    type: "object",
    properties: {
      inputPath: {
        type: "string",
        description:
          "Attachment URL (e.g. /api/attachments/...) of the input audio file (.mp3, .wav) to convert.",
      },
      voiceId: {
        type: "string",
        description:
          "Target voice ID from 'list_voice_catalog' tool (e.g. '1pAo3XuopqND1XIDGKB4', 'karan', etc.).",
      },
      storage: {
        type: "string",
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
    required: ["inputPath", "voiceId", "storage"],
  },
};

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
  attachment: AttachmentReceipt;
  voiceId: string;
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

  // 1. Resolve input file directly
  let resolved: string | null = null;
  try {
    resolved = await materializeAttachment(inputPathRaw);
  } catch {
    resolved = null;
  }
  const processInputPath =
    resolved ?? (fs.existsSync(inputPathRaw) ? inputPathRaw : "");

  if (!fs.existsSync(processInputPath)) {
    throw new Error(`Input file not found at ${inputPathRaw}`);
  }

  const voiceId = resolveVoiceId((args.voiceId ?? "").trim());

  // 2. Read audio file directly
  const fileBuffer = fs.readFileSync(processInputPath);
  const filename = path.basename(processInputPath);
  const ext = path.extname(processInputPath).toLowerCase();
  const mimeType = ext === ".wav" ? "audio/wav" : "audio/mpeg";

  // Support camelCase with fallback to snake_case if passed dynamically
  const anyArgs = args as unknown as Record<string, unknown>;
  const rawStability = args.stability ?? anyArgs.stability;
  const rawSimilarity = args.similarityBoost ?? anyArgs.similarity_boost;
  const rawStyle = args.style ?? anyArgs.style;
  const rawRemoveBg =
    args.removeBackgroundNoise ?? anyArgs.remove_background_noise;

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
      `ElevenLabs STS conversion failed (HTTP ${stsRes.status}): ${errText}`,
    );
  }

  const convertedBuf = Buffer.from(await stsRes.arrayBuffer());

  // 3. Save converted audio directly into attachments
  const ref = await getAttachmentStore().saveFile({
    data: convertedBuf,
    mediaType: "audio/mpeg",
  });
  const attachment = toAttachmentReceipt(ref, "audio/mpeg", {
    storage: args.storage ?? "tmp",
  });

  return {
    voiceId: voiceId,
    attachment,
  };
}

export async function executeConvertAccentTool(
  input: ToolInput<ConvertAccentArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  try {
    const data = await executeConvertAccent(input.args, input.context?.userId);
    const content = `Accent converted to ${data.voiceId} successfully. URL: ${data.attachment.url}. Media type: ${data.attachment.mimeType}. Bytes: ${data.attachment.bytes}.`;
    return {
      success: true,
      data: {
        contentParts: [{ type: "input_text", text: content }],
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [
          { type: "input_text", text: `Error converting accent: ${errorMsg}` },
        ],
      },
      error: errorMsg,
    };
  }
}
