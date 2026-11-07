import type { Session } from "@openai-harness/session";
import fs from "fs";
import path from "path";
import { spawn } from "node:child_process";
import {
  ensureTenantScratchDir,
  materializeAttachment,
  saveAttachment,
} from "@openai-harness/attachment-r2";
import {
  executeFfmpeg,
  findFfmpegPath,
  probeMedia,
} from "@openai-harness/tool-composition";
import { uuidv7 } from "@openai-harness/uuid";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export const DEFAULT_GUIDANCE_SCALE = 1.5;
export const DEFAULT_INFERENCE_STEPS = 18;
export const MAX_ALLOWED_DURATION_SECONDS = 45;

/** LatentSync on an A100 routinely needs minutes for a 45s clip. */
export const LIPSYNC_TIMEOUT_MS = 720_000;

export interface SyncLipsArgs {
  videoPath: string;
  audioPath?: string;
  storage: "tmp" | "artifact";
}

/**
 * How the output was produced. `mock` performs no lip motion at all, so it is
 * reported as such instead of being passed off as a synchronized result.
 */
export type SyncLipsMode = "remote" | "local" | "mock";

interface SyncLipsResult {
  attachmentUrl: string;
  bytes: number;
  mediaType: string;
  mode: SyncLipsMode;
}

/**
 * Serialize GPU work across sessions. `isConcurrencySafe: false` only orders
 * calls inside one step; two concurrent sessions would otherwise spin up two
 * paid GPU containers at once.
 */
let lipsyncTail: Promise<void> = Promise.resolve();

async function acquireLipsyncLock(): Promise<() => void> {
  const previous = lipsyncTail;
  let release!: () => void;
  lipsyncTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  return () => release();
}

export async function executeSyncLips(
  args: SyncLipsArgs,
  userId?: string,
): Promise<SyncLipsResult> {
  const videoPathRaw = (args.videoPath || "").trim();
  if (!videoPathRaw) throw new Error("videoPath is required");
  if (!userId) {
    throw new Error("syncLips requires an authenticated tenant.");
  }

  const videoProcessPath = await materializeAttachment(videoPathRaw, userId);

  let audioProcessPath: string | undefined;
  const audioInput = (args.audioPath || "").trim();
  if (audioInput.length > 0) {
    audioProcessPath = await materializeAttachment(audioInput, userId);
  }

  const probe = probeMedia(videoProcessPath);
  if (probe.duration > MAX_ALLOWED_DURATION_SECONDS) {
    throw new Error(
      `Input video duration (${probe.duration.toFixed(1)}s) exceeds maximum allowed duration of ${MAX_ALLOWED_DURATION_SECONDS} seconds for GPU lip-sync.`,
    );
  }

  const guidanceScale = DEFAULT_GUIDANCE_SCALE;
  const inferenceSteps = DEFAULT_INFERENCE_STEPS;

  const userTmpBase = await ensureTenantScratchDir(userId);
  const tempDir = path.join(
    userTmpBase,
    `lipsync_${Date.now()}_${uuidv7()}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });
  const outputProcessPath = path.join(tempDir, "synced.mp4");

  // No personal absolute path as an implicit fallback: a backend is either
  // configured or the tool says so. `LIPSYNC_MOCK` is the only way to run the
  // audio-mux path, and that path reports that no lip motion was generated.
  const runnerPath = process.env.LIPSYNC_RUNNER_PATH?.trim();
  const webhookUrl =
    process.env.MODAL_LIPSYNC_ENDPOINT_URL || process.env.LIPSYNC_WEBHOOK_URL;
  const isMock = process.env.LIPSYNC_MOCK === "true";
  const hasRemote = Boolean(webhookUrl) && !isMock;
  const hasRunner = Boolean(runnerPath) && fs.existsSync(runnerPath!) && !isMock;

  if (!hasRemote && !hasRunner && !isMock) {
    throw new Error(
      "syncLips has no lip-sync backend. Set MODAL_LIPSYNC_ENDPOINT_URL (remote LatentSync service) or LIPSYNC_RUNNER_PATH (local LatentSync runner) to enable it. Set LIPSYNC_MOCK=true only for tests that intentionally skip lip motion.",
    );
  }

  const releaseLock = await acquireLipsyncLock();

  try {
    let mode: SyncLipsMode;

    if (hasRemote) {
      const formPayload = new FormData();
      const videoBlob = new Blob([fs.readFileSync(videoProcessPath)], {
        type: "video/mp4",
      });
      formPayload.append("video", videoBlob, "video.mp4");
      if (audioProcessPath && fs.existsSync(audioProcessPath)) {
        const audioBlob = new Blob([fs.readFileSync(audioProcessPath)], {
          type: "audio/wav",
        });
        formPayload.append("audio", audioBlob, "audio.wav");
      }
      formPayload.append("guidance_scale", String(guidanceScale));
      formPayload.append("inference_steps", String(inferenceSteps));

      const res = await fetch(webhookUrl!, {
        method: "POST",
        body: formPayload,
        signal: AbortSignal.timeout(LIPSYNC_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `Remote lip-sync server error (${res.status}): ${errText}`,
        );
      }

      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outputProcessPath, buf);
      mode = "remote";
    } else if (hasRunner) {
      const venvPython = path.join(
        path.dirname(runnerPath!),
        ".venv",
        "bin",
        "python",
      );
      const pythonBin = fs.existsSync(venvPython) ? venvPython : "python3";

      const runnerArgs = [
        runnerPath!,
        "--video",
        videoProcessPath,
        "--output",
        outputProcessPath,
        "--guidance-scale",
        String(guidanceScale),
        "--steps",
        String(inferenceSteps),
        "--no-open",
      ];
      if (audioProcessPath && fs.existsSync(audioProcessPath)) {
        runnerArgs.push("--audio", audioProcessPath);
      }

      await new Promise<void>((resolvePromise, rejectPromise) => {
        const proc = spawn(pythonBin, runnerArgs, {
          env: {
            ...process.env,
            PYTHONUNBUFFERED: "1",
          },
        });

        let stderr = "";
        proc.stderr.on("data", (d) => {
          stderr += d.toString();
        });

        const timer = setTimeout(() => {
          proc.kill("SIGTERM");
          rejectPromise(
            new Error(
              `LatentSync runner timed out after ${LIPSYNC_TIMEOUT_MS / 1000}s.`,
            ),
          );
        }, LIPSYNC_TIMEOUT_MS);

        proc.on("error", (err) => {
          clearTimeout(timer);
          rejectPromise(err);
        });
        proc.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0 && fs.existsSync(outputProcessPath)) {
            resolvePromise();
          } else {
            rejectPromise(
              new Error(
                `LatentSync runner exited with code ${code}.\n${stderr.slice(-500)}`,
              ),
            );
          }
        });
      });
      mode = "local";
    } else {
      // Reached only with LIPSYNC_MOCK=true; the guard above rejects every
      // other configuration, so this copy is never presented as lip-sync.
      const ffmpegBin = findFfmpegPath();
      const fallbackArgs = ["-y", "-i", videoProcessPath];
      if (audioProcessPath && fs.existsSync(audioProcessPath)) {
        fallbackArgs.push("-i", audioProcessPath, "-c:v", "copy", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0");
      } else {
        fallbackArgs.push("-c", "copy");
      }
      fallbackArgs.push(outputProcessPath);
      await executeFfmpeg(fallbackArgs, ffmpegBin);
      mode = "mock";
    }

    const outputBuffer = fs.readFileSync(outputProcessPath);
    const saved = await saveAttachment({
      buffer: outputBuffer,
      filename: `synced_${path.basename(videoProcessPath)}`,
      mediaType: "video/mp4",
      storage: args.storage || "tmp",
      userId,
    });

    return {
      attachmentUrl: saved.url,
      bytes: outputBuffer.length,
      mediaType: "video/mp4",
      mode,
    };
  } finally {
    releaseLock();
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
    }
  }
}

export const syncLipsTool = defineTool({
  name: "syncLips",
  description:
    "Prerequisite: video-ad skill is a prerequisite.\n\n" +
    "Synchronize speaker mouth movements and lip motion in a video to match an audio track. " +
    "Requires a configured LatentSync backend (MODAL_LIPSYNC_ENDPOINT_URL or LIPSYNC_RUNNER_PATH).",
  timeoutMs: 900000,
  isConcurrencySafe: () => false,
  parameters: {
    videoPath: {
      type: "string",
      required: true,
      description:
        "Attachment id (`sha256:<hex>`) or '/api/attachments/<attachmentId>' URL of the input video file (.mp4) containing the presenter's face.",
    },
    audioPath: {
      type: "string",
      description:
        "Attachment id (`sha256:<hex>`) or '/api/attachments/<attachmentId>' URL of the target audio file (.wav, .mp3). If omitted, extracts audio directly from the video.",
    },
    storage: {
      type: "string",
      required: true,
      enum: ["tmp", "artifact"],
      description:
        "Storage tier: 'tmp' (default) for intermediate synced clips; 'artifact' for permanent deliverables.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        attachmentUrl: { type: "string", required: true },
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
    title: `Lip-sync video${args.audioPath ? " to audio" : ""}`,
    locations: [{ path: args.videoPath }],
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: `Lip-sync completed: ${(result.meta as any)?.attachmentUrl ?? ""}`,
    content: result.content,
  }),
  async execute(args, exec) {
    const result = await executeSyncLips(args, toolSession<Session>(exec).userId);
    const size = `${Math.round(result.bytes / 1024)} KB`;
    // Never claim lip motion that was not generated: the mock path only muxes
    // audio, so its summary says exactly that.
    const summary =
      result.mode === "mock"
        ? `Mock lip-sync (LIPSYNC_MOCK=true): no mouth motion was generated. The output ${result.attachmentUrl} (${size}) is the input video with ${args.audioPath ? "the supplied audio track muxed in" : "its original audio"}.`
        : `Lip synchronization completed successfully via the ${result.mode === "remote" ? "remote LatentSync endpoint" : "local LatentSync runner"}. Output video saved to: ${result.attachmentUrl} (${size})`;
    return {
      attachmentUrl: result.attachmentUrl,
      bytes: result.bytes,
      mediaType: result.mediaType,
      summary,
    };
  },
});
