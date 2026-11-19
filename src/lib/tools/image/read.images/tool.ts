import fs from "node:fs";
import sharp from "sharp";
import path from "node:path";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { materializeAttachment, getMimeTypeFromExt } from "@/lib/attachments/index";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

/**
 * Unified Tool Definition Schema for OpenAI Managed Agents API.
 * Accepts an array of images to inspect via URL or filename.
 */
export const readImagesToolDefinition = {
  type: "function" as const,
  name: "readImages",
  description:
    "Reads and visually inspects one or multiple images (uploaded by the user or previously generated) using their /api/attachments/... URLs or filenames. The master image on disk remains full-fidelity PNG. Compresses image data on-the-fly to lightweight WebP in memory solely for feeding the visual multimodal perception without changing the master format or referencing URL.",
  parameters: {
    type: "object",
    properties: {
      images: {
        type: "array",
        description: "List of images to visually inspect.",
        items: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "The /api/attachments/... URL or filename of the image.",
            },
          },
          required: ["url"],
        },
      },
    },
    required: ["images"],
  },
};

export interface ReadImagesArgs {
  images: Array<{
    url: string;
  }>;
}

/**
 * Compresses an image on-the-fly in RAM without altering the master copy on disk.
 * Resizes the longest dimension to maxDimension (default 1280px) and transcodes to WebP (Quality 80).
 */
export async function compressImageToWebP(
  filePathOrBuffer: string | Buffer,
  maxDimension = 1280,
  quality = 80,
): Promise<{ base64: string; bytes: number }> {
  const buffer = await sharp(filePathOrBuffer)
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer();

  return {
    base64: buffer.toString("base64"),
    bytes: buffer.byteLength,
  };
}

/**
 * Standardized execute function for the read_images tool.
 */
export async function executeReadImagesTool(
  input: ToolInput<ReadImagesArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  try {
    const rawImages = Array.isArray(input.args?.images)
      ? input.args.images
      : [];

    if (rawImages.length === 0) {
      return {
        success: false,
        error:
          "No images provided to read_images. Please specify { images: [{ url: '...' }] }.",
      };
    }

    const contentParts: InputContentParam[] = [];
    const missing: string[] = [];

    for (const item of rawImages) {
      const url = item?.url?.trim();
      if (!url) continue;

      if (url.startsWith("http://") || url.startsWith("https://")) {
        try {
          const res = await fetch(url);
          if (!res.ok) {
            missing.push(`${url} (HTTP ${res.status})`);
            continue;
          }
          const arrayBuf = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const rawMime =
            res.headers.get("content-type")?.split(";")[0].trim() ||
            "image/png";
          const compressed = await compressImageToWebP(buffer);

          contentParts.push({
            type: "input_text",
            text: [
              `Remote web image:`,
              `- url: ${url}`,
              `- originalBytes: ${buffer.byteLength} (${(buffer.byteLength / 1024).toFixed(1)} KB)`,
              `- mimeType: ${rawMime}`,
              `- note: Transcoded on-the-fly to WebP in memory strictly for visual multimodal perception. Always reference the original URL (${url}) with its native format for downstream tools.`,
            ].join("\n"),
          });

          contentParts.push({
            type: "input_image",
            image_url: `data:image/webp;base64,${compressed.base64}`,
          });
          continue;
        } catch {
          missing.push(url);
          continue;
        }
      }

      let filePath: string | null = null;
      try {
        filePath = await materializeAttachment(url);
      } catch {
        filePath = null;
      }
      filePath ??= fs.existsSync(url) ? url : null;
      if (!filePath || !fs.existsSync(filePath)) {
        missing.push(url);
        continue;
      }

      const stat = fs.statSync(filePath);
      const filename = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const realMimeType = getMimeTypeFromExt(ext) || "image/png";
      const masterFormat = ext.replace(".", "").toUpperCase() || "PNG";
      const compressed = await compressImageToWebP(filePath);

      // Metadata sent as text block
      contentParts.push({
        type: "input_text",
        text: [
          `Image details:`,
          `- url: ${url}`,
          `- filename: ${filename}`,
          `- originalBytes: ${stat.size} (${(stat.size / 1024).toFixed(1)} KB)`,
          `- mimeType: ${realMimeType}`,
          `- masterFormat: ${masterFormat} (Lossless master preserved on disk)`,
          `- note: Transcoded on-the-fly to WebP in memory strictly for your visual perception. Always reference the master URL (${url}) as ${masterFormat} for downstream tools.`,
        ].join("\n"),
      });

      // Multimodal image block sent directly to vision model
      contentParts.push({
        type: "input_image",
        image_url: `data:image/webp;base64,${compressed.base64}`,
      });
    }

    if (contentParts.length === 0) {
      return {
        success: false,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `None of the requested image files were found on disk: ${missing.join(", ")}`,
            },
          ],
        },
        error: `None of the requested image files were found on disk: ${missing.join(", ")}`,
      };
    }

    return {
      success: true,
      data: {
        contentParts,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [
          { type: "input_text", text: `Error in read_images tool: ${message}` },
        ],
      },
      error: `Error in read_images tool: ${message}`,
    };
  }
}
