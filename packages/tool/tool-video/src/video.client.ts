/**
 * HTTP client for the out-of-process video analysis pipeline.
 *
 * The pipeline extracts metadata, transcript, and keyframes; this module only
 * speaks its wire contract, so the tool package that consumes it owns it
 * rather than the host.
 *
 * @module @openai-harness/tool-video/video.client
 */

const VIDEO_PIPELINE_URL =
  process.env.VIDEO_ANALYSIS_PIPELINE ?? "http://localhost:8001";

export interface VideoKeyframe {
  index: number;
  timestampSeconds: number;
  timestampLabel: string;
  detailLevel: "high" | "low";
  base64Jpeg: string;
  mimeType: "image/jpeg" | "image/webp" | string;
}

export interface VideoTranscriptSegment {
  start: number;
  end: number;
  text: string;
  timestamp: string;
}

export interface VideoTranscript {
  language: string;
  fullText: string;
  segments: VideoTranscriptSegment[];
}

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  aspectRatio: string;
  hasAudio: boolean;
  hasVideo: boolean;
  videoCodec: string;
  audioCodec: string | null;
  sizeBytes: number;
  format: string;
}

export interface VideoPipelineStats {
  keyframeCount: number;
  estimatedVisionTokens: number;
  hasTranscript: boolean;
}

export interface VideoPipelineResult {
  metadata: VideoMetadata;
  transcript: VideoTranscript | null;
  keyframes: VideoKeyframe[];
  stats: VideoPipelineStats;
  summaryText: string;
}

export interface VideoPipelineOptions {
  /** Max keyframes to extract (3–80, default 12) */
  maxFrames?: number;
  /** Scene-change threshold (0.1–0.6, default 0.35) */
  sceneThreshold?: number;
  /** Fixed frames-per-second sampling. If set, overrides scene detection. */
  fps?: number;
  /** Analyze only from this timestamp in seconds (optional) */
  startTime?: number;
  /** Analyze only until this timestamp in seconds (optional) */
  endTime?: number;
}

/**
 * Send a video file buffer to the pipeline server for analysis.
 * Returns structured metadata + transcript + keyframes (native camelCase).
 */
export async function analyzeVideoBuffer(
  buffer: Buffer,
  filename: string,
  options: VideoPipelineOptions = {},
): Promise<VideoPipelineResult> {
  const form = new FormData();

  const arrayBuffer: ArrayBuffer =
    buffer.buffer instanceof ArrayBuffer
      ? (buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer)
      : new Uint8Array(buffer).buffer;
  const blob = new Blob([arrayBuffer], { type: getMimeType(filename) });
  form.append("file", blob, filename);
  form.append("maxFrames", String(options.maxFrames ?? 12));
  form.append("sceneThreshold", String(options.sceneThreshold ?? 0.35));
  form.append("fps", String(options.fps ?? 2));
  if (options.startTime !== undefined)
    form.append("startTime", String(options.startTime));
  if (options.endTime !== undefined)
    form.append("endTime", String(options.endTime));

  const response = await fetch(`${VIDEO_PIPELINE_URL}/analyze-video`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(
      `Video pipeline error (${response.status}): ${error.detail ?? "Unknown error"}`,
    );
  }

  return response.json() as Promise<VideoPipelineResult>;
}

/**
 * Send a server-side video file path to the pipeline server for analysis.
 * Use this when the video is already on disk (e.g., generated videos in /data/tmp/).
 * Supports optional startTime/endTime to analyze only a specific segment.
 */
export async function analyzeVideoPath(
  filePath: string,
  options: VideoPipelineOptions = {},
): Promise<VideoPipelineResult> {
  const form = new FormData();
  form.append("url", filePath);
  form.append("maxFrames", String(options.maxFrames ?? 12));
  form.append("sceneThreshold", String(options.sceneThreshold ?? 0.35));
  form.append("fps", String(options.fps ?? 2));
  if (options.startTime !== undefined)
    form.append("startTime", String(options.startTime));
  if (options.endTime !== undefined)
    form.append("endTime", String(options.endTime));

  const response = await fetch(`${VIDEO_PIPELINE_URL}/analyze-video-url`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(
      `Video pipeline error (${response.status}): ${error.detail ?? "Unknown error"}`,
    );
  }

  return response.json() as Promise<VideoPipelineResult>;
}

/**
 * Check if the video pipeline server is running and healthy.
 */
export async function checkVideoPipelineHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${VIDEO_PIPELINE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Build the OpenAI Agents API input_image blocks from pipeline keyframes.
 */
export function buildImageInputBlocks(
  keyframes: VideoKeyframe[],
): Array<{
  type: "input_image";
  image_url: string;
}> {
  return keyframes.map((kf) => ({
    type: "input_image" as const,
    image_url: `data:${kf.mimeType};base64,${kf.base64Jpeg}`,
  }));
}

/**
 * Build a complete multimodal message payload for gpt-6.1-sol.
 * Combines the summaryText with ordered keyframe image blocks.
 */
export function buildAgentVideoPayload(
  result: VideoPipelineResult,
): Array<
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
> {
  return [
    { type: "input_text", text: result.summaryText },
    ...buildImageInputBlocks(result.keyframes),
  ];
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    m4v: "video/x-m4v",
  };
  return map[ext ?? ""] ?? "video/mp4";
}
