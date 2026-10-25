/**
 * Standalone cross-platform FFmpeg runtime, binary resolver, and media probe utilities.
 * Supports Linux (x86_64, arm64), macOS (Apple Silicon, Intel), and Windows.
 * Automatically resolves host binaries, managed ~/.dsh binaries, or downloads
 * hermetic static binaries on demand so the host never requires manual installation.
 *
 * @module @deepseek-ai/dsh-ffmpeg
 */
/** Media metadata probed from an audio or video container. */
export interface MediaProbeResult {
    duration: number;
    width: number;
    height: number;
    fps: number;
    hasVideo: boolean;
    hasAudio: boolean;
    sizeBytes: number;
}
/** Hardware-accelerated or software encoder settings. */
export interface VideoEncoderInfo {
    /** Selected video encoder name (e.g. 'libx264', 'h264_nvenc', 'h264_videotoolbox'). */
    videoCodec: string;
    /** Global hardware acceleration arguments (e.g. ['-hwaccel', 'cuda']). */
    hwaccelArgs: string[];
    /** Whether the host is running Apple Silicon macOS. */
    isAppleSilicon: boolean;
    /** Whether NVIDIA GPU acceleration is active on Linux/Windows. */
    isNvidia?: boolean;
    /** Standard encoding CLI arguments matching the detected accelerator. */
    encodingArgs: string[];
}
/** Details of the resolved FFmpeg binary. */
export interface FfmpegResolution {
    /** Absolute path to the resolved ffmpeg executable. */
    readonly ffmpegPath: string;
    /** Absolute path to ffprobe executable if available. */
    readonly ffprobePath?: string | undefined;
    /** Origin of the binary: explicit override or hermetic standalone. */
    readonly source: 'env' | 'standalone';
    /** Probed version string (e.g. "6.1.1" or "8.1.2"). */
    readonly version?: string | undefined;
    /** Whether Apple Silicon VideoToolbox is available. */
    readonly hasVideoToolbox: boolean;
    /** Whether NVIDIA NVENC is available. */
    readonly hasNvenc: boolean;
}
/** Options for resolving FFmpeg. */
export interface ResolveFfmpegOptions {
    /** Explicit binary path override (e.g. from FFMPEG_PATH or config). */
    readonly explicitPath?: string | undefined;
    /** Custom root directory for standalone tools (defaults to ~/.dsh). */
    readonly dshHome?: string | undefined;
    /** Whether to allow downloading a standalone static binary if missing. Defaults to true. */
    readonly allowDownload?: boolean | undefined;
}
/**
 * Locate hermetic, managed, or system FFmpeg binary across Linux, macOS, and Windows.
 * @returns absolute path or command name for executable FFmpeg binary.
 */
export declare function findFfmpegPath(): string;
/**
 * Detect hardware-accelerated video encoder availability across platforms.
 * Prioritizes Linux NVIDIA (NVENC) or macOS VideoToolbox, falling back to universal libx264.
 * @param ffmpegPath - optional explicit FFmpeg binary path.
 * @returns detected encoder and acceleration arguments.
 */
export declare function detectVideoEncoder(ffmpegPath?: string): VideoEncoderInfo;
/**
 * Probe media file to extract duration, dimensions, framerate, and stream capabilities.
 * @param filePath - absolute path to media file.
 * @param ffmpegPath - optional explicit FFmpeg binary path.
 * @returns probed media attributes.
 */
export declare function probeMedia(filePath: string, ffmpegPath?: string): MediaProbeResult;
/**
 * Execute FFmpeg process with arguments and cooperative cancellation.
 * @param args - CLI arguments passed to FFmpeg.
 * @param signal - optional cancellation signal.
 * @param ffmpegPath - optional explicit FFmpeg binary path.
 */
export declare function executeFfmpeg(args: string[], signal?: AbortSignal, ffmpegPath?: string): Promise<void>;
/**
 * Probe an executable binary to verify it executes and identify supported hardware encoders.
 * @param executable - Absolute path to ffmpeg.
 * @returns Capabilities and version.
 */
export declare function probeFfmpegCapabilities(executable: string): Promise<{
    version?: string | undefined;
    hasVideoToolbox: boolean;
    hasNvenc: boolean;
}>;
/**
 * Download and install the standalone static FFmpeg binary into the destination directory.
 * @param destinationDir - Directory receiving the binary (e.g. ~/.dsh/tools/ffmpeg/bin).
 * @returns Absolute path to the installed executable.
 */
export declare function installStandaloneFfmpeg(destinationDir: string): Promise<string>;
/**
 * Resolve the active FFmpeg binary according to the standalone priority hierarchy:
 * 1. Explicit path / FFMPEG_PATH environment variable override
 * 2. Primary Authority: Standalone managed binary in ~/.dsh/tools/ffmpeg/bin/ffmpeg or ~/.dsh/bin/ffmpeg
 * 3. Automatic standalone static installation (if missing and allowDownload is true)
 *
 * @param options - Resolution settings.
 * @returns The resolved FFmpeg details.
 */
export declare function resolveFfmpeg(options?: ResolveFfmpegOptions): Promise<FfmpegResolution>;
/**
 * Ensure the resolved FFmpeg executable's directory is present on `process.env.PATH`.
 * Also symlinks into `~/.dsh/bin/ffmpeg` so future shell sessions discover it.
 *
 * @param options - Resolution settings.
 * @returns The resolved ffmpeg executable path.
 */
export declare function ensureFfmpegOnPath(options?: ResolveFfmpegOptions): Promise<string>;
//# sourceMappingURL=index.d.ts.map