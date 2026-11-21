import { getOpenAIClient } from "@/lib/core/agent";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { getAttachmentStore, toAttachmentReceipt } from "@/lib/attachments/index";
import type { ImageGenerateParamsNonStreaming } from "openai/resources/images";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

/**
 * Returns the configured image model strictly from the environment variable.
 * Defaults strictly to 'gpt-image-2'.
 */
export function getOpenAIImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
}

/**
 * Unified Tool Definition Schema for OpenAI Managed Agents API.
 * Accepts an array of creative designs so 1 or multiple images can be generated easily.
 */
export const generateImagesToolDefinition = {
  type: "function" as const,
  name: "generateImages",
  description:
    "Generates one or multiple high-resolution marketing visual assets, ad posters, flyers, banners, and product photography.",
  parameters: {
    type: "object",
    properties: {
      images: {
        type: "array",
        description: "List of creative designs to generate.",
        items: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "A vivid, descriptive visual prompt.",
            },
            title: {
              type: "string",
              description: "Short title or headline for the creative visual.",
            },
            aspectRatio: {
              type: "string",
              enum: ["1:1", "16:9", "9:16", "4:5"],
              description: "Mandatory aspect ratio.",
            },
          },
          required: ["prompt", "aspectRatio"],
        },
      },
      quality: {
        type: "string",
        enum: ["low", "medium", "high"],
        description:
          "Image quality tier: 'low', 'medium', or 'high' (defaults to 'high' for high-resolution marketing assets).",
      },
    },
    required: ["images"],
  },
};

export interface GenerateImagesArgs {
  images?: Array<{
    prompt: string;
    title: string;
    aspectRatio: "1:1" | "16:9" | "9:16" | "4:5";
  }>;
  quality?: "low" | "medium" | "high";
}

/**
 * Internal single image generator.
 */
async function generateImage(
  prompt: string,
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:5" = "9:16",
  quality: "low" | "medium" | "high" = "high",
  userId?: string,
): Promise<{ imageUrl: string; aspectRatio: string }> {
  const client = getOpenAIClient();
  const imageModel = getOpenAIImageModel();

  if (!client) {
    throw new Error(
      "OpenAI client is not configured. Please set OPENAI_API_KEY in your .env file.",
    );
  }

  let size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024";
  if (aspectRatio === "9:16" || aspectRatio === "4:5") {
    size = "1024x1792";
  } else if (aspectRatio === "16:9") {
    size = "1792x1024";
  }

  const isDallE3 = imageModel.includes("dall-e-3");
  const qualityValue = isDallE3
    ? quality === "high"
      ? "hd"
      : "standard"
    : quality || "high";

  const imageParams: ImageGenerateParamsNonStreaming = {
    model: imageModel,
    prompt: prompt,
    n: 1,
    size,
    quality: qualityValue,
    ...(isDallE3 ? {} : { output_format: "png" as const }),
  };

  const response = await client.images.generate(imageParams);

  const imageData = response.data?.[0];
  if (!imageData) {
    throw new Error(`No image data returned from image model ${imageModel}`);
  }

  let attachmentUrl = "";

  if (imageData.b64_json) {
    const ref = await getAttachmentStore().saveImage({
      data: Buffer.from(imageData.b64_json, "base64"),
      mediaType: "image/png",
    });
    attachmentUrl = toAttachmentReceipt(ref, "image/png", {}).url;
  } else if (imageData.url) {
    try {
      const res = await fetch(imageData.url);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const ref = await getAttachmentStore().saveImage({
          data: Buffer.from(arrayBuf),
          mediaType: "image/png",
        });
        attachmentUrl = toAttachmentReceipt(ref, "image/png", {}).url;
      } else {
        attachmentUrl = imageData.url;
      }
    } catch {
      attachmentUrl = imageData.url;
    }
  }

  if (!attachmentUrl) {
    throw new Error(
      `Failed to extract valid image URL or base64 from ${imageModel}`,
    );
  }

  return {
    imageUrl: attachmentUrl,
    aspectRatio: size,
  };
}

/**
 * Standardized execute function for generate_images tool.
 */
export async function executeGenerateImagesTool(
  input: ToolInput<GenerateImagesArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  try {
    const rawArgs = input?.args || {};
    const rawImages = Array.isArray(rawArgs.images) ? rawArgs.images : [];
    const itemsToGenerate: Array<{
      prompt: string;
      title: string;
      aspectRatio: "1:1" | "16:9" | "9:16" | "4:5";
    }> = [];

    if (rawImages.length > 0) {
      for (const item of rawImages) {
        if (item && typeof item === "object") {
          const p = typeof item.prompt === "string" ? item.prompt.trim() : "";
          const t =
            typeof item.title === "string" && item.title.trim()
              ? item.title.trim()
              : "Creative Visual";
          const ar = (item.aspectRatio || "1:1") as
            | "1:1"
            | "16:9"
            | "9:16"
            | "4:5";
          if (p) itemsToGenerate.push({ prompt: p, title: t, aspectRatio: ar });
        }
      }
    }

    if (itemsToGenerate.length === 0) {
      const errorMsg = "No image prompts provided in generateImages request.";
      return {
        success: false,
        data: {
          contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
        },
        error: errorMsg,
      };
    }
    const qualityTier = rawArgs.quality || "high";

    const generatedImages = await Promise.all(
      itemsToGenerate.map(async (item) => {
        const res = await generateImage(
          item.prompt,
          item.aspectRatio,
          qualityTier,
          input.context?.userId,
        );
        return {
          url: res.imageUrl,
          title: item.title,
          aspectRatio: item.aspectRatio,
        };
      }),
    );

    const markdown = [
      `### Generated ${generatedImages.length} Image(s):`,
      ...generatedImages.map(
        (img) =>
          `- **${img.title}** (${img.aspectRatio}): [${img.title}](${img.url})\n\n![${img.title}](${img.url})`,
      ),
    ].join("\n\n");

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: markdown,
          },
        ],
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${message}` }],
      },
      error: message,
    };
  }
}
