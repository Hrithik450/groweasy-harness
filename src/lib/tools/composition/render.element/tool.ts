import sharp from "sharp";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import {
  getAttachmentStore,
  toAttachmentReceipt,
  type AttachmentReceipt,
} from "@/lib/attachments/index";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const renderElementToolDefinition = {
  type: "function" as const,
  name: "renderElement",
  preSkills: "render-template",
  description:
    "Renders any graphic element, end CTA card, banner, lower-third, badge, or visual overlay from an SVG definition into a crisp high-resolution PNG image using Sharp. Returns the image attachment URL for compositing into videos via FFmpeg or embedding in chat.",
  parameters: {
    type: "object",
    properties: {
      svg: {
        type: "string",
        description:
          "Complete SVG markup string including width, height, background, typography, shapes, and brand colors.",
      },
    },
    required: ["svg"],
  },
};

export interface RenderElementArgs {
  svg: string;
}

export interface RenderElementResult {
  attachment: AttachmentReceipt;
  width: number;
  height: number;
}

export async function executeRenderElement(
  args: RenderElementArgs,
  userId?: string,
): Promise<RenderElementResult> {
  const svgContent = (args.svg || "").trim();
  if (!svgContent) {
    throw new Error("svg markup string is required.");
  }

  if (!svgContent.includes("<svg") || !svgContent.includes("</svg>")) {
    throw new Error("Invalid SVG: missing <svg>...</svg> tags.");
  }

  const svgBuffer = Buffer.from(svgContent, "utf-8");

  // Rasterize vector SVG to crisp PNG via Sharp
  const image = sharp(svgBuffer);
  const metadata = await image.metadata();

  const pngBuffer = await image
    .png({
      compressionLevel: 8,
      adaptiveFiltering: true,
    })
    .toBuffer();

  const ref = await getAttachmentStore().saveImage({
    data: pngBuffer,
    mediaType: "image/png",
  });
  const attachment = toAttachmentReceipt(ref, "image/png", {
  });

  return {
    attachment,
    width: metadata.width || 1080,
    height: metadata.height || 1920,
  };
}

export async function executeRenderElementTool(
  input: ToolInput<RenderElementArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const rawArgs = input.args || {};

  try {
    const result = await executeRenderElement(
      {
        svg: rawArgs.svg,
      },
      input.context?.userId,
    );

    const summary = [
      `Rendered graphic element successfully:`,
      `- Attachment URL: ${result.attachment.url}`,
      `- Resolution: ${result.width}x${result.height}`,
      `- File Size: ${(result.attachment.bytes / 1024).toFixed(1)} KB`,
    ].join("\n");

    return {
      success: true,
      data: {
        contentParts: [{ type: "input_text", text: summary }],
      },
    };
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error ? error.message : "Failed to render element";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }
}
