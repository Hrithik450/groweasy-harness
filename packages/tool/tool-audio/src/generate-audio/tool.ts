import type { Session } from "@openai-harness/session";
import { saveAttachment } from "@openai-harness/attachment-r2";
import { resolveVoiceId } from "../utils";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface GenerateAudioArgs {
  text: string;
  voiceId?: string;
  storage?: "tmp" | "artifact";
  modelId?: string;
}

export interface GenerateAudioResult {
  attachmentUrl: string;
  voiceId: string;
  bytes: number;
  mediaType: string;
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
      "ELEVENLABS_API_KEY environment variable is required for speech synthesis.",
    );
  }

  const targetVoiceId = resolveVoiceId((args.voiceId || "1pAo3XuopqND1XIDGKB4").trim());
  const modelId = (args.modelId || "eleven_multilingual_v2").trim();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs Text-to-Speech API error (${response.status}): ${errorText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const saved = await saveAttachment({
    buffer,
    filename: "generated_audio.mp3",
    mediaType: "audio/mpeg",
    storage: args.storage || "tmp",
    userId,
  });

  return {
    attachmentUrl: saved.url,
    voiceId: targetVoiceId,
    bytes: buffer.length,
    mediaType: "audio/mpeg",
  };
}

export const generateAudioTool = defineTool({
  name: "generateAudio",
  description:
    "Text-to-Speech audio synthesis. Generates realistic, high-quality voiceover audio from a text script using voice personas, accents, and pacing from the voice catalog.",
  timeoutMs: 60000,
  isConcurrencySafe: () => true,
  parameters: {
    text: {
      type: "string",
      required: true,
      description:
        "The dialogue narration or script text to synthesize into spoken audio.",
    },
    voiceId: {
      type: "string",
      description:
        "Voice ID or persona name from the 'listVoiceCatalog' tool (e.g. 'shivraj', 'dr-joshi', 'vanishree', 'kalyan', or an ElevenLabs voice ID).",
    },
    storage: {
      type: "string",
      enum: ["tmp", "artifact"],
      description:
        "Storage tier: 'tmp' (default) for intermediate takes; 'artifact' for permanent deliverables.",
    },
    modelId: {
      type: "string",
      description: "ElevenLabs model ID (defaults to 'eleven_multilingual_v2').",
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
    title: `Generate audio (${args.voiceId || "default"})`,
    rawInput: args.text,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: `Generated audio: ${(result.meta as any)?.attachmentUrl ?? ""}`,
    content: result.content,
  }),
  async execute(args, exec) {
    const result = await executeGenerateAudio(args, toolSession<Session>(exec).userId);
    const summary = `Generated audio successfully with voice '${result.voiceId}'. URL: ${result.attachmentUrl} (${Math.round(result.bytes / 1024)} KB)`;
    return {
      attachmentUrl: result.attachmentUrl,
      voiceId: result.voiceId,
      bytes: result.bytes,
      mediaType: result.mediaType,
      summary,
    };
  },
});
