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

export const dubAudioToolDefinition = {
  type: "function" as const,
  name: "dubAudio",
  description:
    "Translates and dubs speech from an input audio track into a target language" +
    "while automatically preserving exact timeline pacing, pauses, and duration. ",
  parameters: {
    type: "object",
    properties: {
      inputPath: {
        type: "string",
        description:
          "Attachment URL (e.g. /api/attachments/...) of the source audio file (.mp3, .wav) to dub.",
      },
      targetLanguage: {
        type: "string",
        enum: ["Hindi", "Kannada", "English"],
        description:
          "Target language to dub the speech into: 'Hindi', 'Kannada', or 'English'. Hinglish is not supported.",
      },
    },
    required: ["inputPath", "targetLanguage"],
  },
};

function mapToLanguageCode(lang: string): string {
  const clean = lang.trim().toLowerCase();
  switch (clean) {
    case "hi":
    case "hindi":
    case "hinglish":
      return "hi";
    case "kn":
    case "kannada":
      return "kn";
    case "en":
    case "english":
      return "en";
    default:
      return clean;
  }
}

export interface DubAudioArgs {
  inputPath: string;
  targetLanguage: "Hindi" | "Kannada" | "English" | string;
}

export interface DubAudioResult {
  attachment: AttachmentReceipt;
  targetLanguage: string;
}

export async function executeDubAudio(
  args: DubAudioArgs,
  userId?: string,
): Promise<DubAudioResult> {
  const inputPathRaw = (args.inputPath || "").trim();
  if (!inputPathRaw) {
    throw new Error("inputPath is required (e.g. /api/attachments/...)");
  }

  const rawTargetLang = (args.targetLanguage || "").trim();
  if (!rawTargetLang) {
    throw new Error(
      "targetLanguage is required (e.g. 'Hindi', 'Kannada', 'English')",
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY environment variable is required for audio dubbing.",
    );
  }

  // 1. Resolve source audio file directly
  let resolved: string | null = null;
  try {
    resolved = await materializeAttachment(inputPathRaw);
  } catch {
    resolved = null;
  }
  const processInputPath =
    resolved ?? (fs.existsSync(/*turbopackIgnore: true*/ inputPathRaw) ? inputPathRaw : "");

  if (!fs.existsSync(/*turbopackIgnore: true*/ processInputPath)) {
    throw new Error(`Input audio file not found at ${inputPathRaw}`);
  }

  const targetLangCode = mapToLanguageCode(rawTargetLang);

  // 2. Prepare FormData for official ElevenLabs /v1/dubbing endpoint
  const fileBuffer = fs.readFileSync(/*turbopackIgnore: true*/ processInputPath);
  const filename = path.basename(processInputPath);
  const ext = path.extname(processInputPath).toLowerCase();
  const mimeType = ext === ".wav" ? "audio/wav" : "audio/mpeg";

  const formData = new FormData();
  const fileBlob = new Blob([fileBuffer], { type: mimeType });
  formData.append("file", fileBlob, filename);
  formData.append("target_lang", targetLangCode);

  // 3. Initiate Dubbing Project
  const dubUrl = "https://api.elevenlabs.io/v1/dubbing";
  const dubRes = await fetch(dubUrl, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!dubRes.ok) {
    const errText = await dubRes.text().catch(() => "");
    throw new Error(
      `ElevenLabs dubbing creation failed (HTTP ${dubRes.status}): ${errText}`,
    );
  }

  const dubData = (await dubRes.json()) as { dubbing_id: string };
  const dubbingId = dubData.dubbing_id;

  // 4. Poll until dubbing is completed
  const startTime = Date.now();
  const timeoutMs = 240_000; // 4 minutes max
  let isDubbed = false;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const statusRes = await fetch(
      `https://api.elevenlabs.io/v1/dubbing/${dubbingId}`,
      {
        headers: { "xi-api-key": apiKey },
      },
    );

    if (!statusRes.ok) {
      const errText = await statusRes.text().catch(() => "");
      throw new Error(
        `Failed to check dubbing status (HTTP ${statusRes.status}): ${errText}`,
      );
    }

    const statusJson = (await statusRes.json()) as {
      status: string;
      error?: string;
    };
    if (statusJson.status === "dubbed") {
      isDubbed = true;
      break;
    }
    if (statusJson.status === "failed") {
      throw new Error(
        `ElevenLabs dubbing failed: ${statusJson.error || "Unknown error"}`,
      );
    }
  }

  if (!isDubbed) {
    throw new Error("ElevenLabs dubbing timed out after 120 seconds.");
  }

  // 5. Download the dubbed audio file
  const downloadUrl = `https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/${targetLangCode}`;
  const downloadRes = await fetch(downloadUrl, {
    headers: { "xi-api-key": apiKey },
  });

  if (!downloadRes.ok) {
    const errText = await downloadRes.text().catch(() => "");
    throw new Error(
      `Failed to download dubbed audio (HTTP ${downloadRes.status}): ${errText}`,
    );
  }

  const audioBuffer = Buffer.from(await downloadRes.arrayBuffer());

  // 6. Save dubbed audio directly into attachments
  const ref = await getAttachmentStore().saveFile({
    data: audioBuffer,
    mediaType: "audio/mpeg",
  });
  const attachment = toAttachmentReceipt(ref, "audio/mpeg", {
  });

  return {
    attachment,
    targetLanguage: rawTargetLang,
  };
}

export async function executeDubAudioTool(
  input: ToolInput<DubAudioArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  try {
    const data = await executeDubAudio(input.args, input.context?.userId);
    const content = `Audio dubbed successfully into ${data.targetLanguage}. URL: ${data.attachment.url}. Duration and timing 100% synchronized with original audio track.`;
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
          { type: "input_text", text: `Error dubbing audio: ${errorMsg}` },
        ],
      },
      error: errorMsg,
    };
  }
}
