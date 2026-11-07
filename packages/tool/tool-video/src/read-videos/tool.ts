import type { Session } from "@openai-harness/session";
import path from "node:path";
import {
  AttachmentId,
  isImageAttachmentRef,
  materializeAttachment,
  saveAttachment,
  type ImageAttachmentRef,
  type ImageMediaType,
} from "@openai-harness/attachment-r2";
import { MAX_REQUEST_IMAGES } from "@openai-harness/llm-openai";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";
import type { ContentBlock } from "@openai-harness/llm";
import {
  analyzeVideoPath,
  analyzeVideoBuffer,
  checkVideoPipelineHealth,
  type VideoKeyframe,
  type VideoPipelineOptions,
  type VideoPipelineResult,
} from "../video.client";

/** Pipeline floor: it will not extract fewer than three keyframes. */
const MIN_PIPELINE_FRAMES = 3;

/** Durable keyframe delivered beside the analysis text. */
interface AttachedKeyframe {
  attachmentId: string;
  mediaType: ImageMediaType;
  bytes: number;
  width: number;
  height: number;
  index: number;
  timestampLabel: string;
  detailLevel: string;
}

/** One analyzed video: its model-facing text plus the keyframes sent with it. */
interface VideoAnalysis {
  index: number;
  path: string;
  segmentLabel: string;
  text: string;
  keyframes: AttachedKeyframe[];
}

/** Fallback text for a pipeline response that omitted `summaryText`. */
function fallbackAnalysisText(result: VideoPipelineResult): string {
  const lines = [
    `- Duration: ${result.metadata.durationSeconds}s | Format: ${result.metadata.aspectRatio} | FPS: ${result.metadata.fps}`,
    `- Frames analyzed: ${result.stats.keyframeCount}`,
  ];
  if (result.transcript?.fullText) {
    lines.push(`- Transcript: "${result.transcript.fullText}"`);
  } else {
    lines.push("- Transcript: no speech detected.");
  }
  return lines.join("\n");
}

/**
 * Persist keyframes as tmp image attachments so the model receives real image
 * blocks. The attachment store is the only place the harness hands images to
 * the provider; inline base64 from the analysis pipeline would never reach it.
 */
async function attachKeyframes(
  keyframes: readonly VideoKeyframe[],
  tenantId: string,
  budget: number,
): Promise<{ attached: AttachedKeyframe[]; failures: number }> {
  const attached: AttachedKeyframe[] = [];
  let failures = 0;

  for (const keyframe of keyframes.slice(0, Math.max(0, budget))) {
    try {
      const saved = await saveAttachment(
        Buffer.from(keyframe.base64Jpeg, "base64"),
        {
          mimeType: keyframe.mimeType,
          filename: `keyframe_${keyframe.index}.jpg`,
          storage: "tmp",
        },
        tenantId,
      );
      if (!isImageAttachmentRef(saved.ref)) {
        failures += 1;
        continue;
      }
      attached.push({
        attachmentId: saved.ref.attachmentId,
        mediaType: saved.ref.mediaType,
        bytes: saved.ref.bytes,
        width: saved.ref.width,
        height: saved.ref.height,
        index: keyframe.index,
        timestampLabel: keyframe.timestampLabel,
        detailLevel: keyframe.detailLevel,
      });
    } catch {
      failures += 1;
    }
  }

  return { attached, failures };
}

/** Model-facing text block for one analyzed video. */
export function buildAnalysisText(
  index: number,
  total: number,
  videoPath: string,
  segmentLabel: string,
  result: VideoPipelineResult,
  attached: number,
  attachFailures: number,
): string {
  const heading = `### Video ${index}/${total}: ${videoPath}${segmentLabel}`;
  const body = result.summaryText?.trim() || fallbackAnalysisText(result);
  const notes: string[] = [];

  const skipped = result.keyframes.length - attached - attachFailures;
  if (skipped > 0) {
    notes.push(
      `> [!NOTE]\n> ${skipped} of ${result.keyframes.length} keyframes were not attached: a model request carries at most ${MAX_REQUEST_IMAGES} images. Analyze fewer videos or shorter segments to see them.`,
    );
  }
  if (attachFailures > 0) {
    notes.push(
      `> [!NOTE]\n> ${attachFailures} keyframe(s) could not be stored and are missing from the image blocks.`,
    );
  }

  return [heading, "", body, ...notes].join("\n");
}

export const readVideosTool = defineTool({
  name: "readVideos",
  description:
    "Visually inspects and analyzes videos via speech transcript, keyframes, and metadata. " +
    "Returns the pipeline's analysis text followed by the extracted keyframes as image blocks. " +
    "Inspect in small chunks (e.g. 5-10s segments like 0-5s, 5-10s) using startTime and endTime to stay under the output size limit.",
  // Videos are analyzed sequentially, each running Whisper plus frame
  // extraction, so the budget covers a multi-clip call.
  timeoutMs: 600000,
  isConcurrencySafe: () => true,
  parameters: {
    videos: {
      type: "array",
      required: true,
      description: "List of videos to inspect.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          inputPath: {
            type: "string",
            required: true,
            description:
              "Attachment id (`sha256:<hex>`), '/api/attachments/<attachmentId>' URL, or remote http(s) URL.",
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
      },
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string", required: true },
        analysisCount: { type: "number", required: true },
        videos: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              index: { type: "number", required: true },
              path: { type: "string", required: true },
              segmentLabel: { type: "string", required: true },
              text: { type: "string", required: true },
              keyframes: {
                type: "array",
                required: true,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    attachmentId: { type: "string", required: true },
                    mediaType: { type: "string", required: true },
                    bytes: { type: "number", required: true },
                    width: { type: "number", required: true },
                    height: { type: "number", required: true },
                    index: { type: "number", required: true },
                    timestampLabel: { type: "string", required: true },
                    detailLevel: { type: "string", required: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    render: (_args, value) => {
      const blocks: ContentBlock[] = [];
      const videos = Array.isArray(value.videos) ? value.videos : [];

      for (const raw of videos) {
        const video = raw as Record<string, unknown>;
        blocks.push({ type: "text", text: String(video.text ?? "") });

        const keyframes = Array.isArray(video.keyframes)
          ? video.keyframes
          : [];
        for (const rawKeyframe of keyframes) {
          const keyframe = rawKeyframe as Record<string, unknown>;
          const mediaType = String(keyframe.mediaType) as ImageMediaType;
          const ref: ImageAttachmentRef = {
            attachmentId: AttachmentId(String(keyframe.attachmentId)),
            mediaType,
            bytes: Number(keyframe.bytes),
            width: Number(keyframe.width),
            height: Number(keyframe.height),
          };
          blocks.push({
            type: "image",
            ref,
            mimeType: mediaType,
            width: ref.width,
            height: ref.height,
            alt: `Video ${Number(video.index)} keyframe at ${String(keyframe.timestampLabel)}`,
          });
        }
      }

      if (blocks.length === 0) {
        blocks.push({ type: "text", text: String(value.summary) });
      }

      return blocks;
    },
    presentationMeta: (_args, value) => ({
      analysisCount: value.analysisCount,
    }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "read",
    title: `Inspect video (${args.videos?.length ?? 0} clips)`,
    locations: args.videos?.map((v) => ({ path: v.inputPath })),
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "read",
    title: `Video inspection completed (${(result.meta as any)?.analysisCount ?? 0} clips)`,
    content: result.content,
  }),
  async execute(args, exec) {
    const rawVideos = Array.isArray(args.videos) ? args.videos : [];
    if (rawVideos.length === 0) {
      throw new Error(
        "No videos provided. Please specify { videos: [{ inputPath: '...' }] }.",
      );
    }

    const tenantId = toolSession<Session>(exec).userId;
    if (!tenantId) {
      throw new Error("readVideos requires an authenticated tenant.");
    }

    const pipelineAlive = await checkVideoPipelineHealth();
    if (!pipelineAlive) {
      throw new Error(
        "Video analysis pipeline is unreachable. Start the analysis service configured by VIDEO_ANALYSIS_PIPELINE (default http://localhost:8001).",
      );
    }

    const analyses: VideoAnalysis[] = [];
    const errors: string[] = [];

    // Keyframes become image blocks, and one provider request carries at most
    // MAX_REQUEST_IMAGES of them. Allocate that budget across the requested
    // videos so each clip keeps a visual timeline instead of the first one
    // consuming the whole cap.
    let remainingImages = MAX_REQUEST_IMAGES;

    for (let idx = 0; idx < rawVideos.length; idx++) {
      const item = rawVideos[idx];
      const rawPath = item?.inputPath?.trim();
      if (!rawPath) continue;

      const startTime =
        typeof item.startTime === "number"
          ? Math.max(0, item.startTime)
          : undefined;
      const endTime =
        typeof item.endTime === "number" ? item.endTime : undefined;

      const segmentDuration =
        startTime !== undefined && endTime !== undefined
          ? endTime - startTime
          : (endTime ?? undefined);

      if (segmentDuration !== undefined && segmentDuration > 60) {
        throw new Error(
          `Segment duration (${segmentDuration.toFixed(1)}s) exceeds maximum allowed duration of 60 seconds.`,
        );
      }

      const videosLeft = rawVideos.length - idx;
      const frameBudget =
        remainingImages > 0
          ? Math.min(
              MAX_REQUEST_IMAGES,
              Math.max(MIN_PIPELINE_FRAMES, Math.floor(remainingImages / videosLeft)),
            )
          : MIN_PIPELINE_FRAMES;

      // One frame per second spreads the samples across the whole segment;
      // maxFrames then evenly subsamples when the segment is longer.
      const options: VideoPipelineOptions = {
        fps: 1,
        maxFrames: frameBudget,
        startTime,
        endTime,
      };

      try {
        let result: VideoPipelineResult;
        if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
          const res = await fetch(rawPath, { signal: exec.signal });
          if (!res.ok) {
            throw new Error(
              `Failed to fetch remote video (HTTP ${res.status}): ${rawPath}`,
            );
          }
          const arrayBuf = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const filename =
            path.basename(new URL(rawPath).pathname) || "video.mp4";
          result = await analyzeVideoBuffer(buffer, filename, options);
        } else {
          const resolvedPath = await materializeAttachment(rawPath, tenantId);
          result = await analyzeVideoPath(resolvedPath, options);
        }

        const segmentLabel =
          startTime !== undefined || endTime !== undefined
            ? ` [Segment: ${startTime ?? 0}s → ${endTime ?? result.metadata.durationSeconds}s]`
            : " [Full Video]";

        const { attached, failures } = await attachKeyframes(
          result.keyframes,
          tenantId,
          Math.min(frameBudget, remainingImages),
        );
        remainingImages = Math.max(0, remainingImages - attached.length);

        analyses.push({
          index: idx + 1,
          path: rawPath,
          segmentLabel,
          text: buildAnalysisText(
            idx + 1,
            rawVideos.length,
            rawPath,
            segmentLabel,
            result,
            attached.length,
            failures,
          ),
          keyframes: attached,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${rawPath}: ${msg}`);
      }
    }

    if (analyses.length === 0) {
      throw new Error(
        `Failed to analyze requested video(s):\n${errors.join("\n")}`,
      );
    }

    const summaryLines = analyses.map((analysis) => analysis.text);
    if (errors.length > 0) {
      summaryLines.push(
        `### Failed Videos\n${errors.map((error) => `- ${error}`).join("\n")}`,
      );
    }

    return {
      summary: summaryLines.join("\n\n"),
      analysisCount: analyses.length,
      videos: analyses,
    };
  },
});
