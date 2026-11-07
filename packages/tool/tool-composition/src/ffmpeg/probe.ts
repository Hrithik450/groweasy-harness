import {
  rmSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "@openai-harness/uuid";
import { dataPath } from "@openai-harness/paths";
import { execSync, spawn, spawnSync } from "node:child_process";

export interface MediaProbeResult {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  sizeBytes: number;
}

export interface VideoEncoderInfo {
  videoCodec: string;
  hwaccelArgs: string[];
  isAppleSilicon: boolean;
  isNvidia?: boolean;
  encodingArgs: string[];
}

let cachedFfmpegPath: string | null = null;
let cachedFfprobePath: string | null = null;

/**
 * Resolves the absolute path to the local or system FFmpeg binary across macOS and Linux.
 * Returns null gracefully if not found.
 */
export function getResolvedFfmpegPath(): string | null {
  if (cachedFfmpegPath && existsSync(cachedFfmpegPath)) {
    return cachedFfmpegPath;
  }

  const candidates: string[] = [];

  if (process.env.FFMPEG_PATH) {
    candidates.push(process.env.FFMPEG_PATH);
  }

  if (process.platform === "darwin") {
    candidates.push(
      "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
      "/opt/homebrew/bin/ffmpeg",
      "/usr/local/bin/ffmpeg",
      "/usr/bin/ffmpeg",
    );
  } else if (process.platform === "linux") {
    candidates.push(
      "/usr/bin/ffmpeg",
      "/usr/local/bin/ffmpeg",
      "/snap/bin/ffmpeg",
    );
  } else if (process.platform === "win32") {
    candidates.push(
      "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
    );
  }

  for (const c of candidates) {
    if (existsSync(c)) {
      cachedFfmpegPath = c;
      return c;
    }
  }

  try {
    const whichCmd =
      process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    const sysPath = execSync(whichCmd, { encoding: "utf-8" })
      .trim()
      .split("\n")[0]
      .trim();
    if (sysPath && existsSync(sysPath)) {
      cachedFfmpegPath = sysPath;
      return sysPath;
    }
  } catch {}

  return null;
}

/**
 * Checks whether FFmpeg binary is available in the current environment.
 */
export function isFfmpegInstalled(): boolean {
  return getResolvedFfmpegPath() !== null;
}

/**
 * Discovers the absolute path to the local or system FFmpeg binary.
 * Throws Error if not installed.
 */
export function findFfmpegPath(): string {
  const resolved = getResolvedFfmpegPath();
  if (resolved) {
    return resolved;
  }

  throw new Error(
    "FFmpeg binary not found on system. Please install ffmpeg (e.g. 'brew install ffmpeg' on macOS or 'apt install ffmpeg' on Linux) or set FFMPEG_PATH.",
  );
}

/**
 * Resolves the absolute path to the local or system FFprobe binary across macOS and Linux.
 */
export function getResolvedFfprobePath(): string | null {
  if (cachedFfprobePath && existsSync(cachedFfprobePath)) {
    return cachedFfprobePath;
  }

  const binaryName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const candidates: string[] = [];

  if (process.env.FFPROBE_PATH) {
    candidates.push(process.env.FFPROBE_PATH);
  }

  const home = process.env.HOME || "";
  if (home) {
    candidates.push(
      join(home, ".dsh", "tools", "ffmpeg", "bin", binaryName),
      join(home, ".dsh", "bin", binaryName),
      join(home, ".local", "bin", binaryName),
      join(home, "bin", binaryName),
    );
  }

  if (process.platform === "darwin") {
    candidates.push(
      "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe",
      "/opt/homebrew/bin/ffprobe",
      "/usr/local/bin/ffprobe",
      "/usr/bin/ffprobe",
    );
  } else if (process.platform === "linux") {
    candidates.push(
      "/usr/bin/ffprobe",
      "/usr/local/bin/ffprobe",
      "/snap/bin/ffprobe",
    );
  }

  for (const c of candidates) {
    if (existsSync(c)) {
      cachedFfprobePath = c;
      return c;
    }
  }

  try {
    const whichCmd =
      process.platform === "win32" ? "where ffprobe" : "which ffprobe";
    const sysPath = execSync(whichCmd, { encoding: "utf-8" })
      .trim()
      .split("\n")[0]
      .trim();
    if (sysPath && existsSync(sysPath)) {
      cachedFfprobePath = sysPath;
      return sysPath;
    }
  } catch {}

  return getResolvedFfmpegPath();
}

/**
 * Discovers the absolute path to the local or system FFprobe binary.
 */
export function findFfprobePath(): string {
  const resolved = getResolvedFfprobePath();
  if (resolved) {
    return resolved;
  }
  return findFfmpegPath();
}

/**
 * Probes container and stream metadata for audio/video media.
 */
export function probeMedia(filePath: string): MediaProbeResult {
  const probePath = findFfprobePath();

  try {
    const res = spawnSync(
      probePath,
      [
        "-v",
        "error",
        "-show_entries",
        "stream=width,height,r_frame_rate,duration,codec_type",
        "-show_entries",
        "format=duration,size",
        "-of",
        "json",
        filePath,
      ],
      { encoding: "utf-8" },
    );

    if (res.status === 0 && res.stdout) {
      const parsed = JSON.parse(res.stdout);
      const streams = parsed.streams || [];
      const format = parsed.format || {};

      const videoStream = streams.find(
        (s: { codec_type?: string }) => s.codec_type === "video",
      );
      const audioStream = streams.find(
        (s: { codec_type?: string }) => s.codec_type === "audio",
      );

      let fps = 30;
      if (videoStream?.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
        if (den && den > 0) {
          fps = Math.round(num / den);
        }
      }

      const duration =
        parseFloat(format.duration) ||
        parseFloat(videoStream?.duration) ||
        parseFloat(audioStream?.duration) ||
        0;

      return {
        duration,
        width: videoStream?.width || 1080,
        height: videoStream?.height || 1920,
        fps: fps || 30,
        hasVideo: !!videoStream,
        hasAudio: !!audioStream,
        sizeBytes: parseInt(format.size || "0", 10),
      };
    }
  } catch (err) {
    console.warn(`[FFmpeg probe] Failed to probe ${filePath}:`, err);
  }

  return {
    duration: 0,
    width: 1080,
    height: 1920,
    fps: 30,
    hasVideo: true,
    hasAudio: true,
    sizeBytes: 0,
  };
}

/**
 * Detects optimal hardware-accelerated or software encoder settings.
 */
export function detectVideoEncoder(
  ffmpegPath: string = findFfmpegPath(),
): VideoEncoderInfo {
  const isAppleSilicon =
    process.platform === "darwin" && process.arch === "arm64";

  try {
    const res = spawnSync(ffmpegPath, ["-encoders"], { encoding: "utf-8" });
    const stdout = res.stdout || "";

    if (isAppleSilicon && stdout.includes("h264_videotoolbox")) {
      return {
        videoCodec: "h264_videotoolbox",
        hwaccelArgs: [],
        isAppleSilicon: true,
        encodingArgs: [
          "-c:v",
          "h264_videotoolbox",
          "-b:v",
          "8M",
          "-pix_fmt",
          "yuv420p",
        ],
      };
    }

    if (stdout.includes("h264_nvenc")) {
      return {
        videoCodec: "h264_nvenc",
        hwaccelArgs: ["-hwaccel", "cuda"],
        isAppleSilicon: false,
        isNvidia: true,
        encodingArgs: [
          "-c:v",
          "h264_nvenc",
          "-preset",
          "p4",
          "-pix_fmt",
          "yuv420p",
        ],
      };
    }
  } catch {}

  return {
    videoCodec: "libx264",
    hwaccelArgs: [],
    isAppleSilicon: false,
    encodingArgs: [
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
    ],
  };
}

/**
 * Executes FFmpeg asynchronously with a promise wrapper.
 */
export async function executeFfmpeg(
  args: string[],
  ffmpegPath: string = findFfmpegPath(),
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: 0 });
      } else {
        reject(
          new Error(
            `FFmpeg process exited with code ${code}.\nCommand: ffmpeg ${args.join(" ")}\nStderr:\n${stderr}`,
          ),
        );
      }
    });
  });
}

/**
 * Trims video buffer using FFmpeg to discard head settling artifacts.
 */
export function trimVideo(
  inputBuffer: Buffer,
  targetDuration: number,
  trimIn: number,
  ffmpegPath: string = findFfmpegPath(),
): Buffer {
  if (trimIn <= 0) return inputBuffer;
  const tempDir = dataPath("tmp", `trim_${Date.now()}_${randomUUID()}`);

  try {
    mkdirSync(tempDir, { recursive: true });
    const inPath = join(tempDir, "in.mp4");
    const outPath = join(tempDir, "out.mp4");
    writeFileSync(inPath, inputBuffer);

    const res = spawnSync(ffmpegPath, [
      "-y",
      "-ss",
      String(trimIn),
      "-i",
      inPath,
      "-t",
      String(targetDuration),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outPath,
    ]);

    if (res.status === 0 && existsSync(outPath)) {
      return readFileSync(outPath);
    }
    return inputBuffer;
  } catch {
    return inputBuffer;
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
