import fs from "node:fs";
import path from "node:path";
import { uuidv7 } from "@/lib/utils/uuid";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import {
  ensureScratchDir,
  getAttachmentStore,
  materializeAttachment,
  toAttachmentReceipt,
  getMimeTypeFromExt,
  type ImageMediaType,
} from "@/lib/attachments/index";
import {
  executeFfmpeg,
  isFfmpegInstalled,
  getResolvedFfmpegPath,
} from "./probe";
import { parseCommandArgs } from "./utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const ffmpegToolDefinition = {
  type: "function" as const,
  name: "ffmpeg",
  preSkills: "ffmpeg",
  description:
    "Universal cross-platform FFmpeg execution tool. Transcode, filter, scale, crop, pad, slice, composite, concatenate, or convert formats. " +
    "Input files must be referenced by their '/api/attachments/...' URL. Output file path is managed automatically by the system using 'extension'.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description:
          "FFmpeg command arguments and filters (e.g. '-i /api/attachments/video.mp4 -vf scale=720:1280'). Do not specify an output filename in the command; the system automatically appends and will give you refernce to output path.",
      },
      extension: {
        type: "string",
        description:
          "Target output file extension supported by FFmpeg: video ('.mp4', '.webm', '.mov'), audio ('.mp3', '.wav', '.m4a'), images/frames ('.png', '.webp', '.jpg'), subtitles ('.ass', '.srt', '.vtt'), or animation ('.gif').",
      },
      storage: {
        type: "string",
        enum: ["tmp", "artifact"],
        description:
          "Storage tier: 'tmp' (default) for intermediate edits; 'artifact' for permanent deliverables.",
      },
    },
    required: ["command", "extension", "storage"],
  },
};

export interface FfmpegArgs {
  command: string;
  extension: string;
  storage: "tmp" | "artifact";
}

function isImageMediaType(mediaType: string): mediaType is ImageMediaType {
  return (
    mediaType === "image/png" ||
    mediaType === "image/jpeg" ||
    mediaType === "image/webp" ||
    mediaType === "image/gif"
  );
}

/**
 * Executes the FFmpeg tool.
 */
export async function executeFfmpegTool(
  input: ToolInput<FfmpegArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const rawArgs = input.args || {};

  // 1. Check if FFmpeg is installed in this environment
  if (!isFfmpegInstalled()) {
    const unavailableMsg =
      "FFmpeg tool is not installed or available in this environment. " +
      "Please install FFmpeg (e.g. 'brew install ffmpeg' on macOS or 'apt install ffmpeg' on Linux) or configure the FFMPEG_PATH environment variable.";

    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: unavailableMsg }],
      },
      error: unavailableMsg,
    };
  }

  const ffmpegBin = getResolvedFfmpegPath()!;

  // 2. Parse command string
  const command =
    typeof rawArgs.command === "string" ? rawArgs.command.trim() : "";

  if (!command) {
    const errorMsg = "No 'command' string provided to execute FFmpeg.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: errorMsg }],
      },
      error: errorMsg,
    };
  }

  let tokens = parseCommandArgs(command);
  if (tokens.length === 0) {
    const errorMsg = "Failed to parse command string into arguments.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: errorMsg }],
      },
      error: errorMsg,
    };
  }

  // Strip leading "ffmpeg" or "ffmpeg.exe" if provided
  if (tokens[0] === "ffmpeg" || tokens[0] === "ffmpeg.exe") {
    tokens.shift();
  }

  // Ensure -y overwrite flag is present
  if (!tokens.includes("-y")) {
    tokens.unshift("-y");
  }

  // 3. Resolve any /api/attachments/ URLs in arguments (both standalone and embedded inside filter expressions)
  tokens = await Promise.all(
    tokens.map(async (arg) => {
      if (arg.startsWith("/api/attachments/")) {
        try {
          return await materializeAttachment(arg);
        } catch {
          return arg;
        }
      }
      if (!arg.includes("/api/attachments/")) return arg;

      let resolvedArg = arg;
      const matches = arg.matchAll(
        /\/api\/attachments\/(?:[a-zA-Z0-9_\-]+\/)?(?:tmp\/)?([a-zA-Z0-9_\-\.]+)/g,
      );
      for (const match of matches) {
        let resolved: string | null = null;
        try {
          resolved = await materializeAttachment(match[0]);
        } catch {
          resolved = null;
        }
        if (resolved) resolvedArg = resolvedArg.replace(match[0], resolved);
      }
      return resolvedArg;
    }),
  );

  // 4. Resolve output target via extension: system manages output path
  const ext = (rawArgs.extension || "")
    .trim()
    .toLowerCase()
    .replace(/^\.?/, ".");
  if (!ext || ext === ".") {
    const errorMsg = "Missing required 'extension' argument for FFmpeg output.";
    return {
      success: false,
      data: { contentParts: [{ type: "input_text", text: errorMsg }] },
      error: errorMsg,
    };
  }

  // Remove redundant trailing output filename if model included one
  if (tokens.length > 0 && path.extname(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  const storageTier = rawArgs.storage ?? "tmp";
  const targetDir = await ensureScratchDir();
  const outputFilename = `${uuidv7()}${ext}`;
  const targetOutputPath = path.join(targetDir, outputFilename);

  tokens.push(targetOutputPath);

  try {
    // 5. Execute FFmpeg directly to the target output path
    const result = await executeFfmpeg(tokens, ffmpegBin);

    // 6. Check if an output file was generated
    if (
      targetOutputPath &&
      fs.existsSync(targetOutputPath) &&
      fs.statSync(targetOutputPath).size > 0
    ) {
      const bytes = fs.statSync(targetOutputPath).size;
      const mimeType = getMimeTypeFromExt(ext);
      const isVideo = mimeType.startsWith("video/");
      const isAudio = mimeType.startsWith("audio/");
      const isSubtitle =
        mimeType.startsWith("text/") ||
        ext === ".ass" ||
        ext === ".srt" ||
        ext === ".vtt";
      const isImage = mimeType.startsWith("image/");
      const label = isVideo
        ? "Processed Video"
        : isAudio
          ? "Processed Audio"
          : isSubtitle
            ? "Subtitles / Captions"
            : isImage
              ? "Processed Image"
              : "Processed Media";

      const data = await fs.promises.readFile(targetOutputPath);
      const store = getAttachmentStore();
      const ref = isImageMediaType(mimeType)
        ? await store.saveImage({
            data,
            mediaType: mimeType,
            name: outputFilename,
          })
        : await store.saveFile({
            data,
            mediaType: mimeType,
            name: outputFilename,
          });
      const saved = toAttachmentReceipt(ref, mimeType, {
        storage: storageTier,
        filename: outputFilename,
      });
      const message = `FFmpeg command executed successfully (${bytes} bytes). Output saved to ${saved.url}. Embed in markdown via [${label}](${saved.url}).`;

      return {
        success: true,
        data: {
          contentParts: [{ type: "input_text", text: message }],
        },
      };
    }

    // 7. Informational / probing command without direct file output
    const infoMessage = `FFmpeg command executed successfully.\nOutput:\n${result.stdout.slice(0, 4000) || result.stderr.slice(0, 2000)}`;
    return {
      success: true,
      data: {
        contentParts: [{ type: "input_text", text: infoMessage }],
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [
          { type: "input_text", text: `FFmpeg error: ${errorMsg}` },
        ],
      },
      error: errorMsg,
    };
  }
}
