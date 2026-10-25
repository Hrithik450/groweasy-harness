/**
 * Standalone cross-platform FFmpeg runtime, binary resolver, and media probe utilities.
 * Supports Linux (x86_64, arm64), macOS (Apple Silicon, Intel), and Windows.
 * Automatically resolves host binaries, managed ~/.dsh binaries, or downloads
 * hermetic static binaries on demand so the host never requires manual installation.
 *
 * @module @deepseek-ai/dsh-ffmpeg
 */
import { execFile, execSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync, } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
const gunzipAsync = promisify(gunzip);
const execFileAsync = promisify(execFile);
/** Static binary URLs for platforms where host ffmpeg may be absent. */
const STATIC_FFMPEG_MAP = {
    'darwin-arm64': {
        url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64.gz',
        filename: 'ffmpeg',
        isGz: true,
    },
    'darwin-x64': {
        url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-x64.gz',
        filename: 'ffmpeg',
        isGz: true,
    },
    'linux-x64': {
        url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz',
        filename: 'ffmpeg',
        isGz: true,
    },
    'linux-arm64': {
        url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-arm64.gz',
        filename: 'ffmpeg',
        isGz: true,
    },
    'win32-x64': {
        url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz',
        filename: 'ffmpeg.exe',
        isGz: true,
    },
};
/**
 * Locate hermetic, managed, or system FFmpeg binary across Linux, macOS, and Windows.
 * @returns absolute path or command name for executable FFmpeg binary.
 */
export function findFfmpegPath() {
    if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }
    const home = resolveDshHome();
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const candidates = [
        join(home, 'tools', 'ffmpeg', 'bin', binaryName),
        join(home, 'bin', binaryName),
    ];
    if (process.platform === 'darwin') {
        candidates.push('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg');
    }
    else if (process.platform === 'linux') {
        candidates.push('/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/snap/bin/ffmpeg');
    }
    else if (process.platform === 'win32') {
        candidates.push('C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe', 'C:\\ffmpeg\\bin\\ffmpeg.exe');
    }
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return 'ffmpeg';
}
/**
 * Detect hardware-accelerated video encoder availability across platforms.
 * Prioritizes Linux NVIDIA (NVENC) or macOS VideoToolbox, falling back to universal libx264.
 * @param ffmpegPath - optional explicit FFmpeg binary path.
 * @returns detected encoder and acceleration arguments.
 */
export function detectVideoEncoder(ffmpegPath) {
    const binary = ffmpegPath || findFfmpegPath();
    let isAppleSilicon = false;
    let isNvidia = false;
    let videoCodec = 'libx264';
    let hwaccelArgs = [];
    let encodingArgs = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p'];
    try {
        const stdout = execSync(`${binary} -encoders 2>&1`, { encoding: 'utf-8' });
        if (process.platform === 'darwin' && stdout.includes('h264_videotoolbox')) {
            isAppleSilicon = true;
            videoCodec = 'h264_videotoolbox';
            hwaccelArgs = ['-hwaccel', 'videotoolbox'];
            encodingArgs = ['-c:v', 'h264_videotoolbox', '-b:v', '6000k', '-pix_fmt', 'yuv420p'];
        }
        else if (stdout.includes('h264_nvenc')) {
            isNvidia = true;
            videoCodec = 'h264_nvenc';
            hwaccelArgs = ['-hwaccel', 'cuda'];
            encodingArgs = ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23', '-pix_fmt', 'yuv420p'];
        }
    }
    catch {
        // Fall back to software libx264
    }
    return { videoCodec, hwaccelArgs, isAppleSilicon, isNvidia, encodingArgs };
}
/**
 * Probe media file to extract duration, dimensions, framerate, and stream capabilities.
 * @param filePath - absolute path to media file.
 * @param ffmpegPath - optional explicit FFmpeg binary path.
 * @returns probed media attributes.
 */
export function probeMedia(filePath, ffmpegPath) {
    const binary = ffmpegPath || findFfmpegPath();
    try {
        const res = spawnSync(binary, ['-i', filePath], { encoding: 'utf-8' });
        const output = (res.stderr || '') + (res.stdout || '');
        const durMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        let duration = 0;
        if (durMatch && durMatch[1] && durMatch[2] && durMatch[3]) {
            duration = parseFloat(durMatch[1]) * 3600 + parseFloat(durMatch[2]) * 60 + parseFloat(durMatch[3]);
        }
        const resMatch = output.match(/Video:.*?,\s*(\d+)x(\d+)/);
        const width = resMatch && resMatch[1] ? parseInt(resMatch[1], 10) : 0;
        const height = resMatch && resMatch[2] ? parseInt(resMatch[2], 10) : 0;
        const fpsMatch = output.match(/,\s*(\d+(?:\.\d+)?)\s*fps/);
        const fps = fpsMatch && fpsMatch[1] ? parseFloat(fpsMatch[1]) : 30;
        const hasVideo = Boolean(resMatch || output.includes('Video:'));
        const hasAudio = output.includes('Audio:');
        let sizeBytes = 0;
        try {
            if (existsSync(filePath))
                sizeBytes = statSync(filePath).size;
        }
        catch {
            sizeBytes = 0;
        }
        return {
            duration: parseFloat(duration.toFixed(2)),
            width,
            height,
            fps,
            hasVideo,
            hasAudio,
            sizeBytes,
        };
    }
    catch {
        return {
            duration: 0,
            width: 0,
            height: 0,
            fps: 30,
            hasVideo: false,
            hasAudio: false,
            sizeBytes: 0,
        };
    }
}
/**
 * Execute FFmpeg process with arguments and cooperative cancellation.
 * @param args - CLI arguments passed to FFmpeg.
 * @param signal - optional cancellation signal.
 * @param ffmpegPath - optional explicit FFmpeg binary path.
 */
export async function executeFfmpeg(args, signal, ffmpegPath) {
    const binary = ffmpegPath || findFfmpegPath();
    await new Promise((resolvePromise, rejectPromise) => {
        const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', d => { stderr += d.toString(); });
        const onAbort = () => {
            proc.kill('SIGKILL');
            rejectPromise(new Error('FFmpeg operation was cancelled.'));
        };
        if (signal?.aborted) {
            onAbort();
            return;
        }
        signal?.addEventListener('abort', onAbort);
        proc.on('close', code => {
            signal?.removeEventListener('abort', onAbort);
            if (code === 0)
                resolvePromise();
            else
                rejectPromise(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-500)}`));
        });
    });
}
/**
 * Probe an executable binary to verify it executes and identify supported hardware encoders.
 * @param executable - Absolute path to ffmpeg.
 * @returns Capabilities and version.
 */
export async function probeFfmpegCapabilities(executable) {
    try {
        const { stdout } = await execFileAsync(executable, ['-version'], { timeout: 5000 });
        const versionMatch = /ffmpeg version ([^\s]+)/u.exec(stdout);
        const version = versionMatch?.[1];
        let hasVideoToolbox = false;
        let hasNvenc = false;
        try {
            const { stdout: encOut } = await execFileAsync(executable, ['-encoders'], { timeout: 5000 });
            hasVideoToolbox = encOut.includes('h264_videotoolbox');
            hasNvenc = encOut.includes('h264_nvenc');
        }
        catch { }
        return { version, hasVideoToolbox, hasNvenc };
    }
    catch {
        return { hasVideoToolbox: false, hasNvenc: false };
    }
}
/**
 * Download and install the standalone static FFmpeg binary into the destination directory.
 * @param destinationDir - Directory receiving the binary (e.g. ~/.dsh/tools/ffmpeg/bin).
 * @returns Absolute path to the installed executable.
 */
export async function installStandaloneFfmpeg(destinationDir) {
    const platformKey = `${process.platform}-${process.arch}`;
    const asset = STATIC_FFMPEG_MAP[platformKey];
    if (asset === undefined) {
        throw new Error(`Standalone FFmpeg is not pre-locked for platform: ${platformKey}`);
    }
    await mkdir(destinationDir, { recursive: true });
    const destinationPath = join(destinationDir, asset.filename);
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) {
        throw new Error(`Failed to download standalone FFmpeg from ${asset.url}: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    let binaryBuffer = Buffer.from(arrayBuffer);
    if (asset.isGz) {
        binaryBuffer = await gunzipAsync(binaryBuffer);
    }
    const tempFile = join(destinationDir, `.${randomUUID()}`);
    await writeFile(tempFile, binaryBuffer);
    if (process.platform !== 'win32') {
        chmodSync(tempFile, 0o755);
    }
    rmSync(destinationPath, { force: true });
    symlinkSync(tempFile, destinationPath);
    try {
        unlinkSync(tempFile);
    }
    catch { }
    await writeFile(destinationPath, binaryBuffer);
    if (process.platform !== 'win32') {
        await chmod(destinationPath, 0o755);
    }
    return destinationPath;
}
/**
 * Resolve the active FFmpeg binary according to the standalone priority hierarchy:
 * 1. Explicit path / FFMPEG_PATH environment variable override
 * 2. Primary Authority: Standalone managed binary in ~/.dsh/tools/ffmpeg/bin/ffmpeg or ~/.dsh/bin/ffmpeg
 * 3. Automatic standalone static installation (if missing and allowDownload is true)
 *
 * @param options - Resolution settings.
 * @returns The resolved FFmpeg details.
 */
export async function resolveFfmpeg(options = {}) {
    if (options.explicitPath !== undefined) {
        if (!existsSync(options.explicitPath)) {
            throw new Error(`Explicit FFmpeg binary not found at: ${options.explicitPath}`);
        }
        const explicit = options.explicitPath;
        const probe = await probeFfmpegCapabilities(explicit);
        const probeCandidate = join(dirname(explicit), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
        return {
            ffmpegPath: resolve(explicit),
            ffprobePath: existsSync(probeCandidate) ? probeCandidate : undefined,
            source: 'env',
            version: probe.version,
            hasVideoToolbox: probe.hasVideoToolbox,
            hasNvenc: probe.hasNvenc,
        };
    }
    const envPath = process.env.FFMPEG_PATH;
    if (envPath && existsSync(envPath)) {
        const isHostBinary = /^\/(opt\/homebrew|usr\/bin|usr\/local|System|opt\/local)/i.test(resolve(envPath));
        if (!isHostBinary) {
            const probe = await probeFfmpegCapabilities(envPath);
            const probeCandidate = join(dirname(envPath), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
            return {
                ffmpegPath: resolve(envPath),
                ffprobePath: existsSync(probeCandidate) ? probeCandidate : undefined,
                source: 'env',
                version: probe.version,
                hasVideoToolbox: probe.hasVideoToolbox,
                hasNvenc: probe.hasNvenc,
            };
        }
    }
    const home = options.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh');
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const probeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    const dshToolsPath = join(home, 'tools', 'ffmpeg', 'bin', binaryName);
    const dshBinPath = join(home, 'bin', binaryName);
    for (const candidate of [dshToolsPath, dshBinPath]) {
        if (existsSync(candidate)) {
            const probe = await probeFfmpegCapabilities(candidate);
            const probeCandidate = join(dirname(candidate), probeName);
            return {
                ffmpegPath: resolve(candidate),
                ffprobePath: existsSync(probeCandidate) ? probeCandidate : undefined,
                source: 'standalone',
                version: probe.version,
                hasVideoToolbox: probe.hasVideoToolbox,
                hasNvenc: probe.hasNvenc,
            };
        }
    }
    if (options.allowDownload ?? true) {
        const installDir = join(home, 'tools', 'ffmpeg', 'bin');
        const installed = await installStandaloneFfmpeg(installDir);
        const probe = await probeFfmpegCapabilities(installed);
        return {
            ffmpegPath: resolve(installed),
            source: 'standalone',
            version: probe.version,
            hasVideoToolbox: probe.hasVideoToolbox,
            hasNvenc: probe.hasNvenc,
        };
    }
    throw new Error('Standalone FFmpeg binary is not installed, and automatic downloading was disabled. '
        + 'Please allow automatic download or set FFMPEG_PATH.');
}
/**
 * Ensure the resolved FFmpeg executable's directory is present on `process.env.PATH`.
 * Also symlinks into `~/.dsh/bin/ffmpeg` so future shell sessions discover it.
 *
 * @param options - Resolution settings.
 * @returns The resolved ffmpeg executable path.
 */
export async function ensureFfmpegOnPath(options = {}) {
    const resolution = await resolveFfmpeg(options);
    const binDir = dirname(resolution.ffmpegPath);
    const home = options.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh');
    const dshBin = join(home, 'bin');
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const linkTarget = join(dshBin, binaryName);
    const probeName = process.platform === 'win32' ? 'ffprobe.cmd' : 'ffprobe';
    const probeCandidate = join(binDir, probeName);
    const probeLinkTarget = join(dshBin, probeName);
    try {
        if (!existsSync(probeCandidate)) {
            if (process.platform === 'win32') {
                writeFileSync(probeCandidate, '@echo off\r\n"%~dp0ffmpeg.exe" -hide_banner %*\r\n');
            }
            else {
                writeFileSync(probeCandidate, '#!/usr/bin/env bash\nexec "$(dirname "$0")/ffmpeg" -hide_banner "$@"\n', { mode: 0o755 });
            }
        }
    }
    catch { }
    try {
        mkdirSync(dshBin, { recursive: true });
        if (!existsSync(linkTarget) && linkTarget !== resolution.ffmpegPath) {
            symlinkSync(resolution.ffmpegPath, linkTarget);
        }
        if (existsSync(probeCandidate) && !existsSync(probeLinkTarget)) {
            symlinkSync(probeCandidate, probeLinkTarget);
        }
    }
    catch { }
    const currentPathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
    const remaining = currentPathEntries.filter((p) => p !== binDir && p !== dshBin);
    process.env.PATH = [binDir, dshBin, ...remaining].join(delimiter);
    process.env.FFMPEG_PATH = resolution.ffmpegPath;
    if (resolution.ffprobePath) {
        process.env.FFPROBE_PATH = resolution.ffprobePath;
    }
    return resolution.ffmpegPath;
}
//# sourceMappingURL=index.js.map