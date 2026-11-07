import type { Session } from "@openai-harness/session";
import fs from "fs";
import path from "path";
import { materializeAttachment, saveAttachment } from "@openai-harness/attachment-r2";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface DubAudioArgs {
  inputPath: string;
  targetLanguage: "Hindi" | "Kannada" | "English" | string;
  storage: "tmp" | "artifact";
}

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

export const dubAudioTool = defineTool({
  name: "dubAudio",
  description:
    "Translates and dubs speech from an input audio track into a target language while automatically preserving exact timeline pacing, pauses, and duration.",
  timeoutMs: 180000,
  isConcurrencySafe: () => true,
  parameters: {
    inputPath: {
      type: "string",
      required: true,
      description:
        "Attachment id (`sha256:<hex>`) or '/api/attachments/<attachmentId>' URL of the source audio file (.mp3, .wav) to dub.",
    },
    targetLanguage: {
      type: "string",
      required: true,
      enum: ["Hindi", "Kannada", "English"],
      description:
        "Target language to dub the speech into: 'Hindi', 'Kannada', or 'English'. Hinglish is not supported.",
    },
    storage: {
      type: "string",
      required: true,
      enum: ["tmp", "artifact"],
      description:
        "Storage tier: 'tmp' (default) for intermediate dialogue dubs; 'artifact' for permanent deliverables.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        attachmentUrl: { type: "string", required: true },
        targetLanguage: { type: "string", required: true },
        dubbingId: { type: "string", required: true },
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
    title: `Dub audio -> ${args.targetLanguage}`,
    rawInput: args,
  }),
  presentResult: (args, result) => ({
    card: "generic",
    kind: "execute",
    title: `Audio dubbed (${args.targetLanguage}): ${(result.meta as any)?.attachmentUrl ?? ""}`,
    content: result.content,
  }),
  async execute(args, exec) {
    const inputPathRaw = (args.inputPath || "").trim();
    if (!inputPathRaw) {
      throw new Error("inputPath is required");
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ELEVENLABS_API_KEY environment variable is required for audio dubbing.",
      );
    }

    const tenantId = toolSession<Session>(exec).userId;
    if (!tenantId) {
      throw new Error("dubAudio requires an authenticated tenant.");
    }

    const processInputPath = await materializeAttachment(inputPathRaw, tenantId);
    const fileBuffer = fs.readFileSync(processInputPath);
    const filename = path.basename(processInputPath);
    const ext = path.extname(processInputPath).toLowerCase();
    const mimeType = ext === ".wav" ? "audio/wav" : "audio/mpeg";

    const targetLangCode = mapToLanguageCode(args.targetLanguage || "Hindi");

    const formData = new FormData();
    const fileBlob = new Blob([fileBuffer], { type: mimeType });
    formData.append("file", fileBlob, filename);
    formData.append("target_lang", targetLangCode);
    formData.append("mode", "automatic");

    const createRes = await fetch("https://api.elevenlabs.io/v1/dubbing", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      body: formData,
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      throw new Error(
        `ElevenLabs Dubbing task creation failed (${createRes.status}): ${errText}`,
      );
    }

    const createJson = (await createRes.json()) as { dubbing_id?: string };
    const dubbingId = createJson.dubbing_id;
    if (!dubbingId) {
      throw new Error("Failed to retrieve dubbing_id from ElevenLabs response.");
    }

    const MAX_WAIT_MS = 240000;
    const POLL_INTERVAL_MS = 4000;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(
        `https://api.elevenlabs.io/v1/dubbing/${dubbingId}`,
        {
          headers: {
            "xi-api-key": apiKey,
          },
        },
      );

      if (!pollRes.ok) continue;

      const pollJson = (await pollRes.json()) as {
        status?: string;
        error?: string;
      };

      if (pollJson.status === "dubbed") {
        const audioRes = await fetch(
          `https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/${targetLangCode}`,
          {
            headers: {
              "xi-api-key": apiKey,
            },
          },
        );

        if (!audioRes.ok) {
          throw new Error(
            `Failed to download dubbed audio file (${audioRes.status}).`,
          );
        }

        const arrayBuf = await audioRes.arrayBuffer();
        const outputBuffer = Buffer.from(arrayBuf);

        const saved = await saveAttachment({
          buffer: outputBuffer,
          filename: `dubbed_${targetLangCode}_${filename}`,
          mediaType: "audio/mpeg",
          storage: args.storage || "tmp",
          userId: tenantId,
        });

        const summary = `Audio dubbed successfully to ${args.targetLanguage}. Output saved to: ${saved.url} (${Math.round(outputBuffer.length / 1024)} KB)`;
        return {
          attachmentUrl: saved.url,
          targetLanguage: args.targetLanguage,
          dubbingId,
          summary,
        };
      }

      if (pollJson.status === "failed") {
        throw new Error(`Dubbing task failed: ${pollJson.error || "Unknown error"}`);
      }
    }

    throw new Error(`Dubbing task timed out after ${MAX_WAIT_MS / 1000} seconds.`);
  },
});
