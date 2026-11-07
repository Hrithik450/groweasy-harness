import type { Session } from "@openai-harness/session";
import fs from "fs";
import path from "path";
import {
  getMimeTypeFromExt,
  materializeAttachment,
  saveAttachment,
  type Attachment,
} from "@openai-harness/attachment-r2";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface SaveAssetArgs {
  file?: string;
  content?: string;
  storage: "tmp" | "artifact";
  type: "video" | "image" | "audio" | "file";
}

export async function executeSaveAsset(
  args: SaveAssetArgs,
  userId?: string,
): Promise<Attachment> {
  const storageTier: "tmp" | "artifact" =
    args.storage === "artifact" ? "artifact" : "tmp";

  if (args.content !== undefined && args.content !== null) {
    const textContent = String(args.content);
    let filename = "asset.txt";
    let mediaType = "text/plain";

    if (textContent.includes("<svg") || textContent.includes("</svg>")) {
      filename = "vector_graphic.svg";
      mediaType = "image/svg+xml";
    } else if (
      textContent.includes("[Script Info]") ||
      textContent.includes("Dialogue:")
    ) {
      filename = "subtitles.ass";
      mediaType = "text/x-ssa";
    } else if (
      textContent.trim().startsWith("{") ||
      textContent.trim().startsWith("[")
    ) {
      filename = "data.json";
      mediaType = "application/json";
    }

    return await saveAttachment({
      buffer: Buffer.from(textContent, "utf-8"),
      filename,
      mediaType,
      storage: storageTier,
      userId,
    });
  }

  const fileInput = (args.file || "").trim();
  if (!fileInput) {
    throw new Error(
      "Either 'file' (URL or file path) or 'content' (raw text/script content) must be provided to saveAsset.",
    );
  }

  if (fileInput.startsWith("http://") || fileInput.startsWith("https://")) {
    const res = await fetch(fileInput);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch asset from remote URL (HTTP ${res.status}): ${fileInput}`,
      );
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const contentType =
      res.headers.get("content-type") || "application/octet-stream";
    const filename =
      path.basename(new URL(fileInput).pathname) || "downloaded_asset";

    return await saveAttachment({
      buffer,
      filename,
      mediaType: contentType,
      storage: storageTier,
      userId,
    });
  }

  if (!userId) {
    throw new Error("saveAsset requires an authenticated tenant.");
  }

  let localPath: string;
  try {
    localPath = await materializeAttachment(fileInput, userId);
  } catch (error) {
    throw new Error(
      `'file' must be an attachment id or '/api/attachments/<attachmentId>' URL, or a remote http(s) URL. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const fileBuffer = fs.readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const filename = path.basename(localPath);
  const mediaType = getMimeTypeFromExt(ext);

  return await saveAttachment({
    buffer: fileBuffer,
    filename,
    mediaType,
    storage: storageTier,
    userId,
  });
}

export const saveAssetTool = defineTool({
  name: "saveAsset",
  description:
    "Downloads and saves an external URL (such as web search images, brand logos, or media assets), an existing attachment, or direct text/file content (such as an edited .ass subtitle script) into durable attachment storage. Returns the '/api/attachments/<attachmentId>' delivery URL for downstream tools or embedding in chat.",
  timeoutMs: 30000,
  isConcurrencySafe: () => false,
  parameters: {
    file: {
      type: "string",
      description:
        "A remote http(s) URL, an attachment id (`sha256:<hex>`), or an '/api/attachments/<attachmentId>' URL to copy into attachment storage (use 'content' instead for direct text/scripts).",
    },
    content: {
      type: "string",
      description:
        "Direct text or script content (e.g. edited .ass subtitle script, SVG, or JSON) to save directly as an attachment file.",
    },
    storage: {
      type: "string",
      required: true,
      enum: ["tmp", "artifact"],
      description:
        "Storage tier: 'tmp' for temporary scraped/web reference files; 'artifact' for permanent brand assets.",
    },
    type: {
      type: "string",
      required: true,
      enum: ["video", "image", "audio", "file"],
      description:
        "Media type of the asset (e.g. 'image', 'video', 'audio', 'file').",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        attachmentUrl: { type: "string", required: true },
        mediaType: { type: "string", required: true },
        sizeBytes: { type: "number", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ attachmentUrl: value.attachmentUrl }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "edit",
    title: `Save asset (${args.type}${args.file ? `: ${args.file}` : ""})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "edit",
    title: `Asset saved: ${(result.meta as any)?.attachmentUrl ?? ""}`,
    content: result.content,
  }),
  async execute(args, exec) {
    const attachment = await executeSaveAsset(args, toolSession<Session>(exec).userId);
    const summary = `Asset saved successfully to storage: ${attachment.url} (${attachment.mimeType}, ${Math.round(attachment.bytes / 1024)} KB)`;
    return {
      attachmentUrl: attachment.url,
      mediaType: attachment.mimeType,
      sizeBytes: attachment.bytes,
      summary,
    };
  },
});
