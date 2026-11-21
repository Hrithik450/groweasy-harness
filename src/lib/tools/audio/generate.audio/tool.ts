import { ToolInput, ToolOutput } from "@/lib/tools/types";
import {
  getAttachmentStore,
  toAttachmentReceipt,
  type AttachmentReceipt,
} from "@/lib/attachments/index";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { resolveVoiceId } from "../utils";

export const generateAudioToolDefinition = {
  type: "function" as const,
  name: "generateAudio",
  description:
    "Text-to-Speech audio synthesis. Generates realistic, high-quality voiceover audio from a text script using voice personas, accents, and pacing from the voice catalog.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description:
          "The dialogue narration or script text to synthesize into spoken audio.",
      },
      voiceId: {
        type: "string",
        description:
          "Voice ID or persona name from 'list_voice_catalog' (e.g. 'shivraj', 'dr-joshi', 'vanishree', 'kalyan', or an ElevenLabs voice ID).",
      },
      modelId: {
        type: "string",
        description:
          "ElevenLabs model ID (defaults to 'eleven_multilingual_v2').",
      },
    },
    required: ["text"],
  },
};

export interface GenerateAudioArgs {
  text: string;
  voiceId?: string;
  modelId?: string;
}

export interface GenerateAudioResult {
  attachment: AttachmentReceipt;
  voiceId: string;
}

export async function executeGenerateAudio(
  args: GenerateAudioArgs,
  userId?: string,
): Promise<GenerateAudioResult> {
  const text = (args.text || "").trim();
  if (!text) {
    throw new Error("text is required to generate audio");
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY environment variable is required for audio generation.",
    );
  }

  const voiceId = resolveVoiceId((args.voiceId || "").trim());
  const modelId = args.modelId || "eleven_multilingual_v2";

  const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const response = await fetch(ttsUrl, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs TTS generation failed (HTTP ${response.status}): ${errText}`,
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const ref = await getAttachmentStore().saveFile({
    data: audioBuffer,
    mediaType: "audio/mpeg",
  });
  const attachment = toAttachmentReceipt(ref, "audio/mpeg", {
  });

  return {
    voiceId,
    attachment,
  };
}

export async function executeGenerateAudioTool(
  input: ToolInput<GenerateAudioArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  try {
    const data = await executeGenerateAudio(input.args, input.context?.userId);
    const content = `Audio generated successfully. Voice: ${data.voiceId}. URL: ${data.attachment.url}. Media type: ${data.attachment.mimeType}. Bytes: ${data.attachment.bytes}.`;
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
          { type: "input_text", text: `Error generating audio: ${errorMsg}` },
        ],
      },
      error: errorMsg,
    };
  }
}
