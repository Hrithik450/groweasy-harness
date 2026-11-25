import fs from "node:fs";
import path from "node:path";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { materializeAttachment } from "@/lib/attachments/index";
import {
  analyzeVideoPath,
  analyzeVideoBuffer,
  checkVideoPipelineHealth,
  buildAgentVideoPayload,
  normalizeVideoPipelineOptions,
  VIDEO_HARD_MAX_FPS,
} from "@/lib/core/agent/video";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const readVideosToolDefinition = {
  type: "function" as const,
  name: "readVideos",
  description:
    "Visually inspects and analyzes videos via speech transcript, keyframes, and metadata. " +
    "By default it returns a coarse overview. To inspect fast motion deeply at any point on the timeline, " +
    "choose ONE sampling control per video: `timestamps` (exact seconds), `frameCount` (evenly spaced frames), " +
    "or `fps` (sampling rate), optionally bounded by `startTime`/`endTime`. " +
    `The hard ceiling is ${VIDEO_HARD_MAX_FPS} frames per second; fps above ${VIDEO_HARD_MAX_FPS} is clamped and reported. ` +
    "You may request up to 120 frames per call. Requests that exceed the 5 fps ceiling or capacity are clamped/rejected with a clear message. " +
    "Use timestamps for one precise fast-motion moment; use frameCount with startTime/endTime for a deep range scan.",
  parameters: {
    type: "object",
    properties: {
      videos: {
        type: "array",
        description: "List of videos to inspect.",
        items: {
          type: "object",
          properties: {
            inputPath: {
              type: "string",
              description:
                "Attachment URL (/api/attachments/...), remote URL (https://...), or local file path.",
            },
            startTime: {
              type: "number",
              description:
                "Start time in seconds (optional, >= 0). Bounds timestamps or the frameCount/fps timeline.",
            },
            endTime: {
              type: "number",
              description:
                "End time in seconds (optional, > startTime). Bounds timestamps or the frameCount/fps timeline.",
            },
            fps: {
              type: "number",
              description:
                `Sampling rate (optional). Must be > 0 and <= ${VIDEO_HARD_MAX_FPS}; values above ` +
                `${VIDEO_HARD_MAX_FPS} are clamped and reported. Do not combine with frameCount or timestamps.`,
            },
            frameCount: {
              type: "integer",
              minimum: 1,
              description:
                "Desired number of evenly spaced frames from the requested timeline (optional). " +
                "Do not combine with fps or timestamps. Capped at 120 per call; if the 5 fps ceiling " +
                "allows fewer frames, the response says so.",
            },
            timestamps: {
              type: "array",
              items: { type: "number" },
              description:
                "Exact timestamps in seconds to capture (optional). Minimum spacing 0.2s (5 fps), " +
                "maximum 120 entries. Do not combine with fps or frameCount. Respects startTime/endTime bounds.",
            },
          },
          required: ["inputPath"],
        },
      },
    },
    required: ["videos"],
  },
};

export interface ReadVideosArgs {
  videos: Array<{
    inputPath: string;
    startTime?: number;
    endTime?: number;
    fps?: number;
    frameCount?: number;
    timestamps?: number[];
  }>;
}

export async function executeReadVideosTool(
  input: ToolInput<ReadVideosArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const { args } = input;

  const rawVideos = Array.isArray(args?.videos) ? args.videos : [];
  if (rawVideos.length === 0) {
    const errorMsg =
      "No videos provided. Please specify { videos: [{ inputPath: '...' }] }.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const pipelineAlive = await checkVideoPipelineHealth();
  if (!pipelineAlive) {
    const errorMsg =
      "Video analysis pipeline server is offline. Please start it on localhost:8001.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const contentParts: InputContentParam[] = [];
  const errors: string[] = [];

  for (let idx = 0; idx < rawVideos.length; idx++) {
    const item = rawVideos[idx];
    const rawPath = item?.inputPath?.trim();
    if (!rawPath) continue;

    let normalized;
    try {
      normalized = normalizeVideoPipelineOptions({
        startTime: item.startTime,
        endTime: item.endTime,
        fps: item.fps,
        frameCount: item.frameCount,
        timestamps: item.timestamps,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${rawPath}: ${msg}`);
      continue;
    }

    const { options, notices } = normalized;
    const startTime = options.startTime;
    const endTime = options.endTime;

    const segmentDuration =
      startTime !== undefined && endTime !== undefined
        ? endTime - startTime
        : (endTime ?? undefined);

    if (segmentDuration !== undefined && segmentDuration > 60) {
      errors.push(
        `${rawPath}: Segment duration (${segmentDuration.toFixed(1)}s) exceeds the maximum allowed duration of 60 seconds.`,
      );
      continue;
    }

    try {
      let result;

      if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
        const res = await fetch(rawPath, {
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          throw new Error(
            `Failed to fetch remote video (HTTP ${res.status}): ${rawPath}`,
          );
        }
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        // Service routes end in `/download` with no extension; recover it from
        // the response type so the analyzer can identify the container.
        const contentType = res.headers.get("content-type") ?? "";
        const extension =
          contentType.includes("webm")
            ? ".webm"
            : contentType.includes("quicktime")
              ? ".mov"
              : contentType.includes("mp4")
                ? ".mp4"
                : path.extname(new URL(rawPath).pathname);
        const base = path.basename(new URL(rawPath).pathname) || "video";
        const filename = extension && !base.endsWith(extension)
          ? `${base}${extension}`
          : base;
        result = await analyzeVideoBuffer(buffer, filename, options);
      } else {
        let resolvedPath: string | null = null;
        try {
          resolvedPath = await materializeAttachment(rawPath);
        } catch {
          resolvedPath = null;
        }
        if (!resolvedPath && fs.existsSync(/*turbopackIgnore: true*/ rawPath)) {
          resolvedPath = rawPath;
        }

        if (!resolvedPath || !fs.existsSync(/*turbopackIgnore: true*/ resolvedPath)) {
          throw new Error(`Video file not found on disk: ${rawPath}`);
        }

        result = await analyzeVideoPath(resolvedPath, options);
      }

      // Exact timestamps deliberately target a small part of a longer video,
      // so the full-video duration guard does not apply to them.
      const hasTimestamps = options.timestamps !== undefined;
      if (
        !hasTimestamps &&
        startTime === undefined &&
        endTime === undefined &&
        result.metadata.durationSeconds > 60.5
      ) {
        throw new Error(
          `Video duration (${Math.round(result.metadata.durationSeconds)}s) exceeds 60 seconds limit. ` +
            `Specify startTime/endTime (60 seconds or less), timestamps, or frameCount to inspect a bounded timeline.`,
        );
      }

      const segmentLabel =
        startTime !== undefined || endTime !== undefined
          ? ` [Segment: ${startTime ?? 0}s → ${endTime ?? result.metadata.durationSeconds}s]`
          : " [Full Video]";

      const samplingParts: string[] = [];
      if (result.stats.samplingMode) {
        samplingParts.push(result.stats.samplingMode);
      }
      if (result.stats.framesRequested != null) {
        samplingParts.push(`requested ${result.stats.framesRequested}`);
      }
      if (result.stats.framesReturned != null) {
        samplingParts.push(`returned ${result.stats.framesReturned}`);
      }
      const samplingLine =
        samplingParts.length > 0
          ? `- Sampling: ${samplingParts.join(" | ")}\n`
          : "";

      const notes = [...notices];
      if (result.stats.samplingNote) notes.push(result.stats.samplingNote);
      const noteLine =
        notes.length > 0 ? `> Note: ${notes.join(" ")}\n` : "";

      const videoHeader: InputContentParam = {
        type: "input_text",
        text:
          `### Video ${idx + 1}/${rawVideos.length}: ${rawPath}${segmentLabel}\n` +
          `- Duration: ${result.metadata.durationSeconds}s | Format: ${result.metadata.aspectRatio} | FPS: ${result.metadata.fps}\n` +
          `- Frames: ${result.stats.keyframeCount} | Vision tokens: ~${result.stats.estimatedVisionTokens}\n` +
          samplingLine +
          noteLine +
          `\n`,
      };

      const payload = buildAgentVideoPayload(result);
      contentParts.push(videoHeader, ...payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${rawPath}: ${msg}`);
    }
  }

  if (contentParts.length === 0) {
    const errorMsg = `Failed to analyze requested video(s):\n${errors.join("\n")}`;
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const serializedSize = JSON.stringify(contentParts).length;
  if (serializedSize > 900_000) {
    const errorMsg =
      `Video analysis output (${Math.round(serializedSize / 1024)}KB) exceeds the 1MB limit. ` +
      `Please reduce the timeline of the video/asset you want to read/analyze. process in chunks.`;
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  return {
    success: true,
    data: { contentParts },
  };
}
