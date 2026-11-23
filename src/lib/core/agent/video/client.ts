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
  /** Number of frames the caller asked for (when a count or timestamps were given). */
  framesRequested?: number | null;
  framesReturned?: number;
  /** True when fewer frames were returned than requested (fps ceiling or capacity). */
  truncated?: boolean;
  samplingMode?: "scene" | "fps" | "frame_count" | "timestamps";
  samplingNote?: string | null;
}

export interface VideoPipelineResult {
  metadata: VideoMetadata;
  transcript: VideoTranscript | null;
  keyframes: VideoKeyframe[];
  stats: VideoPipelineStats;
  summaryText: string;
}

/** Hard ceiling for any sampling rate. Never exceed this many frames per second. */
export const VIDEO_HARD_MAX_FPS = 5;
/** Service capacity per call. Requests above this are clamped/rejected with a message. */
export const VIDEO_MAX_FRAMES_PER_CALL = 120;
export const VIDEO_DEFAULT_MAX_FRAMES = 80;
const MIN_TIMESTAMP_GAP_SECONDS = 1 / VIDEO_HARD_MAX_FPS;

export interface VideoPipelineOptions {
  /** Max keyframes to extract (default 80, service capacity 120) */
  maxFrames?: number;
  /** Scene-change threshold (0.1–0.6, default 0.35) */
  sceneThreshold?: number;
  /** Fixed frames-per-second sampling. Must be > 0 and <= 5. */
  fps?: number;
  /** Desired number of evenly spaced frames from the requested timeline. */
  frameCount?: number;
  /** Exact timestamps (seconds) to capture. Minimum spacing 1/5s. */
  timestamps?: number[];
  /** Analyze only from this timestamp in seconds (optional) */
  startTime?: number;
  /** Analyze only until this timestamp in seconds (optional) */
  endTime?: number;
}

export interface NormalizedVideoPipelineOptions {
  options: VideoPipelineOptions;
  /** User-facing notes about clamping or capacity decisions. */
  notices: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate and normalize a sampling request before it reaches the service.
 * Enforces the 5 fps ceiling and reports any clamping instead of silently
 * changing what the caller asked for.
 */
export function normalizeVideoPipelineOptions(
  input: VideoPipelineOptions = {},
): NormalizedVideoPipelineOptions {
  const notices: string[] = [];
  const options: VideoPipelineOptions = { ...input };

  let startTime = input.startTime;
  let endTime = input.endTime;

  if (startTime !== undefined) {
    if (!isFiniteNumber(startTime) || startTime < 0) {
      throw new Error("startTime must be a finite number of seconds >= 0.");
    }
  }
  if (endTime !== undefined) {
    if (!isFiniteNumber(endTime) || endTime < 0) {
      throw new Error("endTime must be a finite number of seconds >= 0.");
    }
  }
  if (endTime !== undefined && endTime <= (startTime ?? 0)) {
    throw new Error(
      `endTime (${endTime}s) must be greater than startTime (${startTime ?? 0}s).`,
    );
  }
  options.startTime = startTime;
  options.endTime = endTime;

  if (input.timestamps !== undefined && !Array.isArray(input.timestamps)) {
    throw new Error("timestamps must be an array of seconds.");
  }
  const hasTimestamps =
    Array.isArray(input.timestamps) && input.timestamps.length > 0;
  const hasFrameCount = input.frameCount !== undefined;
  const hasFps = input.fps !== undefined;

  if (hasTimestamps && hasFrameCount) {
    throw new Error(
      "timestamps and frameCount are mutually exclusive. Use one sampling control per request.",
    );
  }
  if (hasTimestamps && hasFps) {
    throw new Error(
      "timestamps and fps are mutually exclusive. Exact timestamps already define the sampling rate.",
    );
  }
  if (hasFrameCount && hasFps) {
    throw new Error(
      "frameCount and fps are mutually exclusive. Use frameCount for an exact count or fps for a rate.",
    );
  }

  if (hasTimestamps) {
    const raw = input.timestamps as number[];
    for (const timestamp of raw) {
      if (!isFiniteNumber(timestamp) || timestamp < 0) {
        throw new Error(
          "timestamps must be finite, non-negative seconds.",
        );
      }
    }
    const ordered = [...raw].sort((a, b) => a - b);
    for (let i = 1; i < ordered.length; i++) {
      const gap = ordered[i] - ordered[i - 1];
      if (gap < MIN_TIMESTAMP_GAP_SECONDS - 1e-9) {
        throw new Error(
          `timestamps ${ordered[i - 1]}s and ${ordered[i]}s are ${gap.toFixed(3)}s apart; ` +
            `the hard ceiling is ${VIDEO_HARD_MAX_FPS} fps (at most one frame every ` +
            `${MIN_TIMESTAMP_GAP_SECONDS.toFixed(2)}s).`,
        );
      }
    }
    if (startTime !== undefined) {
      const before = ordered.find((t) => t < startTime! - 1e-9);
      if (before !== undefined) {
        throw new Error(
          `timestamp ${before}s is before startTime (${startTime}s).`,
        );
      }
    }
    if (endTime !== undefined) {
      const after = ordered.find((t) => t > endTime! + 1e-9);
      if (after !== undefined) {
        throw new Error(
          `timestamp ${after}s is after endTime (${endTime}s).`,
        );
      }
    }
    if (ordered.length > VIDEO_MAX_FRAMES_PER_CALL) {
      throw new Error(
        `Requested ${ordered.length} timestamps but the maximum is ` +
          `${VIDEO_MAX_FRAMES_PER_CALL} frames per call. Split the timeline into multiple calls.`,
      );
    }
    options.timestamps = ordered;
    options.maxFrames = ordered.length;
  } else {
    options.timestamps = undefined;
  }

  if (hasFrameCount) {
    if (!Number.isInteger(input.frameCount) || (input.frameCount as number) < 1) {
      throw new Error("frameCount must be an integer >= 1.");
    }
    let frameCount = input.frameCount as number;
    if (frameCount > VIDEO_MAX_FRAMES_PER_CALL) {
      notices.push(
        `frameCount ${frameCount} clamped to the ${VIDEO_MAX_FRAMES_PER_CALL}-frame per-call capacity.`,
      );
      frameCount = VIDEO_MAX_FRAMES_PER_CALL;
    }
    options.frameCount = frameCount;
    options.maxFrames = frameCount;
    options.fps = undefined;
  }

  if (hasFps) {
    if (!isFiniteNumber(input.fps) || (input.fps as number) <= 0) {
      throw new Error("fps must be a finite number greater than 0.");
    }
    let fps = input.fps as number;
    if (fps > VIDEO_HARD_MAX_FPS) {
      notices.push(
        `fps ${fps} clamped to the hard ceiling of ${VIDEO_HARD_MAX_FPS} fps.`,
      );
      fps = VIDEO_HARD_MAX_FPS;
    }
    options.fps = fps;
  }

  if (!hasTimestamps && !hasFrameCount) {
    options.maxFrames = input.maxFrames ?? VIDEO_DEFAULT_MAX_FRAMES;
  }
  if (options.maxFrames !== undefined) {
    if (!Number.isInteger(options.maxFrames) || options.maxFrames < 1) {
      throw new Error("maxFrames must be an integer >= 1.");
    }
    if (options.maxFrames > VIDEO_MAX_FRAMES_PER_CALL) {
      notices.push(
        `maxFrames ${options.maxFrames} clamped to the ${VIDEO_MAX_FRAMES_PER_CALL}-frame per-call capacity.`,
      );
      options.maxFrames = VIDEO_MAX_FRAMES_PER_CALL;
    }
  }

  return { options, notices };
}

function appendSamplingFields(
  form: FormData,
  options: VideoPipelineOptions,
): void {
  const { options: normalized } = normalizeVideoPipelineOptions(options);
  form.append("maxFrames", String(normalized.maxFrames ?? VIDEO_DEFAULT_MAX_FRAMES));
  form.append(
    "sceneThreshold",
    String(normalized.sceneThreshold ?? 0.35),
  );
  if (normalized.timestamps !== undefined) {
    form.append("timestamps", JSON.stringify(normalized.timestamps));
  } else if (normalized.frameCount !== undefined) {
    form.append("frameCount", String(normalized.frameCount));
  } else {
    // Preserve the legacy default when the caller omits every sampling control.
    form.append("fps", String(normalized.fps ?? 2));
  }
  if (normalized.startTime !== undefined)
    form.append("startTime", String(normalized.startTime));
  if (normalized.endTime !== undefined)
    form.append("endTime", String(normalized.endTime));
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
  appendSamplingFields(form, options);

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
  appendSamplingFields(form, options);

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
 * By default, sends frames with detail: "low" (85 tokens/frame) to minimize token consumption.
 */
export function buildImageInputBlocks(
  keyframes: VideoKeyframe[],
  detail: "high" | "low" = "low",
): Array<{
  type: "input_image";
  image_url: string;
  detail: "high" | "low";
}> {
  return keyframes.map((kf) => ({
    type: "input_image" as const,
    image_url: `data:${kf.mimeType};base64,${kf.base64Jpeg}`,
    detail,
  }));
}

/**
 * Build a complete multimodal message payload for gpt-5.6-luna.
 * Combines the summaryText with ordered keyframe image blocks.
 * Uses detail: "low" by default across all frames.
 */
export function buildAgentVideoPayload(
  result: VideoPipelineResult,
  detail: "high" | "low" = "low",
): Array<
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" | "low" }
> {
  return [
    { type: "input_text", text: result.summaryText },
    ...buildImageInputBlocks(result.keyframes, detail),
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
