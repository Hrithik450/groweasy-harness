import type { Session } from "@openai-harness/session";
import sharp from "sharp";
import { saveAttachment } from "@openai-harness/attachment-r2";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface RenderElementArgs {
  svg: string;
  storage: "tmp" | "artifact";
}

export interface RenderElementResult {
  attachmentUrl: string;
  width: number;
  height: number;
  bytes: number;
  mediaType: string;
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
  const image = sharp(svgBuffer);
  const metadata = await image.metadata();

  const width = metadata.width || 1080;
  const height = metadata.height || 1080;

  const pngBuffer = await image.png().toBuffer();

  const saved = await saveAttachment({
    buffer: pngBuffer,
    filename: "rendered_element.png",
    mediaType: "image/png",
    storage: args.storage || "tmp",
    userId,
  });

  return {
    attachmentUrl: saved.url,
    width,
    height,
    bytes: pngBuffer.length,
    mediaType: "image/png",
  };
}

export const renderElementTool = defineTool({
  name: "renderElement",
  description:
    "Prerequisite: render-template skill is a prerequisite.\n\n" +
    "Renders any graphic element, end CTA card, banner, lower-third, badge, or visual overlay from an SVG definition into a crisp high-resolution PNG image using Sharp. Returns the '/api/attachments/<attachmentId>' delivery URL for compositing into videos via FFmpeg or embedding in chat.",
  timeoutMs: 60000,
  isConcurrencySafe: () => false,
  parameters: {
    svg: {
      type: "string",
      required: true,
      description:
        "Complete SVG markup string including width, height, background, typography, shapes, and brand colors.",
    },
    storage: {
      type: "string",
      required: true,
      enum: ["tmp", "artifact"],
      description:
        "Storage tier: 'tmp' (default) for intermediate drafts; 'artifact' for permanent deliverables.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        attachmentUrl: { type: "string", required: true },
        width: { type: "number", required: true },
        height: { type: "number", required: true },
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
    presentationMeta: (_args, value) => ({ attachmentUrl: value.attachmentUrl }),
  },
  presentCall: (_args) => ({
    card: "generic",
    kind: "execute",
    title: "Render graphic element (SVG -> PNG)",
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: `Graphic rendered: ${(result.meta as any)?.attachmentUrl ?? ""}`,
    content: result.content,
  }),
  async execute(args, exec) {
    const result = await executeRenderElement(args, toolSession<Session>(exec).userId);
    const summary = `Element rendered successfully as crisp PNG (${result.width}x${result.height}). Output saved to: ${result.attachmentUrl} (${Math.round(result.bytes / 1024)} KB)`;
    return {
      attachmentUrl: result.attachmentUrl,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      mediaType: result.mediaType,
      summary,
    };
  },
});
