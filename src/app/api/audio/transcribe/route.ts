import { NextRequest, NextResponse } from "next/server";
import { toFile } from "openai";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getOpenAIClient } from "@/lib/core/agent/client";

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/** Extensions the transcription API accepts, keyed by container media type. */
const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

/**
 * POST /api/audio/transcribe
 * Dictation only: returns editable text and never submits a conversation turn.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 415 },
      );
    }

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "An audio file is required" },
        { status: 400 },
      );
    }

    if (audio.size === 0) {
      return NextResponse.json(
        { error: "The recording is empty" },
        { status: 400 },
      );
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        {
          error: `Recording exceeds the ${MAX_AUDIO_BYTES / (1024 * 1024)} MB limit`,
        },
        { status: 413 },
      );
    }

    const mediaType = (audio.type || "audio/webm")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extension = AUDIO_EXTENSIONS[mediaType];
    if (!extension) {
      return NextResponse.json(
        { error: `Unsupported audio type "${mediaType}"` },
        { status: 415 },
      );
    }

    const client = getOpenAIClient();
    if (!client) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const model = process.env.STT_MODEL?.trim() || "gpt-4o-mini-transcribe";
    const file = await toFile(
      Buffer.from(await audio.arrayBuffer()),
      `voice.${extension}`,
      { type: mediaType },
    );
    const language =
      typeof form.get("language") === "string"
        ? (form.get("language") as string).trim()
        : "";

    const result = await client.audio.transcriptions.create({
      file,
      model,
      ...(language ? { language } : {}),
    });

    return NextResponse.json({
      success: true,
      data: {
        text: result.text.trim(),
        model,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to transcribe audio";
    console.error("[Audio Transcribe API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
