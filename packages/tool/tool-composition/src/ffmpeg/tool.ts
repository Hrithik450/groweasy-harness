import type { Session } from "@openai-harness/session";
import fs from "node:fs";
import path from "node:path";
import { uuidv7 } from "@openai-harness/uuid";
import {
  ensureTenantScratchDir,
  getMimeTypeFromExt,
  materializeAttachment,
  publicUrlFor,
  saveAttachment,
} from "@openai-harness/attachment-r2";
import {
  executeFfmpeg,
  isFfmpegInstalled,
  getResolvedFfmpegPath,
} from "./probe";
import { parseCommandArgs } from "./utils";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface FfmpegArgs {
  command: string;
  extension: string;
  storage: "tmp" | "artifact";
}

export const ffmpegTool = defineTool({
  name: "ffmpeg",
  description:
    "Prerequisite: ffmpeg skill is a prerequisite.\n\n" +
    "Universal cross-platform FFmpeg execution tool. Transcode, filter, scale, crop, pad, slice, composite, concatenate, or convert formats. " +
    "Input files must be referenced by their attachment id (`sha256:<hex>`) or '/api/attachments/<attachmentId>' URL. " +
    "The output path is managed by the system from 'extension'; the returned value is the '/api/attachments/<attachmentId>' delivery URL of the stored output.",
  timeoutMs: 180000,
  isConcurrencySafe: () => false,
  parameters: {
    command: {
      type: "string",
      required: true,
      description:
        "FFmpeg command arguments and filters (e.g. '-i /api/attachments/<attachmentId> -vf scale=720:1280'). Do not specify an output filename in the command; the system manages the output and returns its attachment URL.",
    },
    extension: {
      type: "string",
      required: true,
      description:
        "Target output file extension supported by FFmpeg: video ('.mp4', '.webm', '.mov'), audio ('.mp3', '.wav', '.m4a'), images/frames ('.png', '.webp', '.jpg'), subtitles ('.ass', '.srt', '.vtt'), or animation ('.gif').",
    },
    storage: {
      type: "string",
      required: true,
      enum: ["tmp", "artifact"],
      description:
        "Storage tier: 'tmp' (default) for intermediate edits; 'artifact' for permanent deliverables.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        outputUrl: { type: "string", required: true },
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
    presentationMeta: (_args, value) => ({ outputUrl: value.outputUrl }),
  },
  presentCall: (args) => ({
    card: "terminal",
    title: `ffmpeg ${args.command}`,
    description: `Target extension: .${args.extension} (${args.storage} storage)`,
  }),
  presentResult: (_args, result) => ({
    card: "terminal",
    title: `ffmpeg output: ${(result.meta as any)?.outputUrl ?? "completed"}`,
    output: (result.content?.[0] as any)?.text,
  }),
  async execute(args, exec) {
    if (!isFfmpegInstalled()) {
      throw new Error(
        "FFmpeg tool is not installed or available in this environment. Please install FFmpeg.",
      );
    }

    const ffmpegBin = getResolvedFfmpegPath()!;
    const command = (args.command || "").trim();
    if (!command) {
      throw new Error("No 'command' string provided to execute FFmpeg.");
    }

    let tokens = parseCommandArgs(command);
    if (tokens.length === 0) {
      throw new Error("Failed to parse command string into arguments.");
    }

    if (tokens[0] === "ffmpeg" || tokens[0] === "ffmpeg.exe") {
      tokens.shift();
    }

    if (!tokens.includes("-y")) {
      tokens.unshift("-y");
    }

    const tenantId = toolSession<Session>(exec).userId;
    if (!tenantId) {
      throw new Error("ffmpeg requires an authenticated tenant.");
    }

    const materialized = new Map<string, string>();
    async function materializeToken(
      arg: string,
      tenant: string,
    ): Promise<string> {
      const matches =
        arg.match(/\/api\/attachments\/[^\s'"]+/g) ??
        (arg.startsWith("sha256:") ? [arg] : []);
      if (matches.length === 0) return arg;

      let resolved = arg;
      for (const match of matches) {
        let localPath = materialized.get(match);
        if (!localPath) {
          localPath = await materializeAttachment(match, tenant);
          materialized.set(match, localPath);
        }
        resolved = resolved.split(match).join(localPath);
      }
      return resolved;
    }

    tokens = await Promise.all(
      tokens.map((token) => materializeToken(token, tenantId)),
    );

    const ext = (args.extension || "").trim().toLowerCase().replace(/^\.?/, ".");
    if (!ext || ext === ".") {
      throw new Error("Missing required 'extension' argument for FFmpeg output.");
    }

    if (tokens.length > 0 && path.extname(tokens[tokens.length - 1])) {
      tokens.pop();
    }

    const storageTier = args.storage ?? "tmp";
    const targetDir = await ensureTenantScratchDir(tenantId);
    const outputFilename = `${uuidv7()}${ext}`;
    const targetOutputPath = path.join(targetDir, outputFilename);

    tokens.push(targetOutputPath);

    try {
      // Must be awaited: the output file only exists once the child exits.
      await executeFfmpeg(tokens, ffmpegBin);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`FFmpeg execution failed:\n${errMsg}`, { cause: err });
    }

    if (!fs.existsSync(targetOutputPath)) {
      throw new Error(
        `FFmpeg command completed but output file was not created at: ${targetOutputPath}`,
      );
    }

    const mediaType = getMimeTypeFromExt(ext);

    try {
      const saved = await saveAttachment(
        {
          buffer: fs.createReadStream(targetOutputPath),
          filename: outputFilename,
          mimeType: mediaType,
          storage: storageTier,
        },
        undefined,
        tenantId,
      );
      const outputUrl = publicUrlFor(saved.ref);
      const summary = `FFmpeg execution succeeded. Output attachment: '${outputUrl}' (${Math.round(saved.bytes / 1024)} KB, ${mediaType}).`;

      return {
        outputUrl,
        bytes: saved.bytes,
        mediaType,
        summary,
      };
    } finally {
      await fs.promises.rm(targetOutputPath, { force: true });
    }
  },
});
