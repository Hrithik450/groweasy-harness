import fs from "node:fs";
import path from "node:path";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { materializeAttachment } from "@/lib/attachments/index";
import {
  analyzeVideoPath,
  analyzeVideoBuffer,
  checkVideoPipelineHealth,
  buildAgentVideoPayload,
  type VideoPipelineOptions,
} from "@/lib/core/agent/video";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const readVideosToolDefinition = {
  type: "function" as const,
  name: "readVideos",
  description:
    "Visually inspects and analyzes videos via speech transcript, keyframes, and metadata. " +
    "Inspect in small chunks (e.g. 5-10s segments like 0-5s, 5-10s) using startTime and endTime to stay under the output size limit.",
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
                "Start time in seconds (optional). Keep segments short (5-10s).",
            },
            endTime: {
              type: "number",
              description:
                "End time in seconds (optional). Keep segments short (5-10s).",
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

    const startTime =
      typeof item.startTime === "number"
        ? Math.max(0, item.startTime)
        : undefined;
    const endTime = typeof item.endTime === "number" ? item.endTime : undefined;

    const segmentDuration =
      startTime !== undefined && endTime !== undefined
        ? endTime - startTime
        : (endTime ?? undefined);

    if (segmentDuration !== undefined && segmentDuration > 60) {
      throw new Error(
        `Segment duration (${segmentDuration.toFixed(1)}s) exceeds maximum allowed duration of 60 seconds.`,
      );
    }

    const options: VideoPipelineOptions = {
      fps: 2,
      maxFrames: 80,
      startTime,
      endTime,
    };

    try {
      let result;

      if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
        const res = await fetch(rawPath);
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
        if (!resolvedPath && fs.existsSync(rawPath)) {
          resolvedPath = rawPath;
        }

        if (!resolvedPath || !fs.existsSync(resolvedPath)) {
          throw new Error(`Video file not found on disk: ${rawPath}`);
        }

        result = await analyzeVideoPath(resolvedPath, options);
      }

      if (
        startTime === undefined &&
        endTime === undefined &&
        result.metadata.durationSeconds > 60.5
      ) {
        throw new Error(
          `Video duration (${Math.round(result.metadata.durationSeconds)}s) exceeds 60 seconds limit. Please specify startTime and endTime to inspect a segment of 60 seconds or less.`,
        );
      }

      const segmentLabel =
        startTime !== undefined || endTime !== undefined
          ? ` [Segment: ${startTime ?? 0}s → ${endTime ?? result.metadata.durationSeconds}s]`
          : " [Full Video]";

      const videoHeader: InputContentParam = {
        type: "input_text",
        text:
          `### Video ${idx + 1}/${rawVideos.length}: ${rawPath}${segmentLabel}\n` +
          `- Duration: ${result.metadata.durationSeconds}s | Format: ${result.metadata.aspectRatio} | FPS: ${result.metadata.fps}\n` +
          `- Frames: ${result.stats.keyframeCount} | Vision tokens: ~${result.stats.estimatedVisionTokens}\n\n`,
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
