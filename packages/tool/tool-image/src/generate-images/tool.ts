import type { Session } from "@openai-harness/session";
import { getOpenAIClient } from "@openai-harness/llm-openai";
import { saveAttachment } from "@openai-harness/attachment-r2";
import type { ImageGenerateParamsNonStreaming } from "openai/resources/images";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export function getOpenAIImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
}

export interface ImageSpec {
  prompt: string;
  title?: string;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:5" | "3:2";
}

export interface GeneratedImageItem {
  prompt: string;
  title: string;
  aspectRatio: string;
  attachmentUrl: string;
}

export const generateImagesTool = defineTool({
  name: "generateImages",
  description:
    "Prerequisite: static-ad or video-ad skill is a prerequisite.\n\n" +
    "Generates one or multiple high-resolution marketing visual assets, ad posters, flyers, banners, and product photography.",
  timeoutMs: 120000,
  isConcurrencySafe: () => true,
  parameters: {
    images: {
      type: "array",
      required: true,
      description: "List of creative designs to generate.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: {
            type: "string",
            required: true,
            description: "A vivid, descriptive visual prompt.",
          },
          title: {
            type: "string",
            description: "Short title or headline for the creative visual.",
          },
          aspectRatio: {
            type: "string",
            required: true,
            enum: ["1:1", "16:9", "9:16", "4:5", "3:2"],
            description: "Mandatory aspect ratio.",
          },
        },
      },
    },
    quality: {
      type: "string",
      enum: ["low", "medium", "high"],
      description:
        "Image quality tier: 'low', 'medium', or 'high' (defaults to 'high' for high-resolution marketing assets).",
    },
    storage: {
      type: "string",
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
        images: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              prompt: { type: "string", required: true },
              title: { type: "string", required: true },
              aspectRatio: { type: "string", required: true },
              attachmentUrl: { type: "string", required: true },
            },
          },
        },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ images: value.images }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "execute",
    title: `Generate images (${args.images?.length ?? 0} designs)`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: `Generated ${((result.meta as any)?.images || []).length} images`,
    content: result.content,
  }),
  async execute(args, exec) {
    const rawImages = Array.isArray(args.images) ? args.images : [];
    if (rawImages.length === 0) {
      throw new Error("No images provided to generate.");
    }

    const client = getOpenAIClient();
    if (!client) {
      throw new Error("OpenAI client is not configured.");
    }

    const model = getOpenAIImageModel();
    const storageTier = args.storage || "tmp";
    const quality = args.quality || "high";

    const generatedResults: GeneratedImageItem[] = [];

    for (let i = 0; i < rawImages.length; i++) {
      const img = rawImages[i];
      const prompt = img.prompt.trim();
      const title = img.title?.trim() || `Design ${i + 1}`;
      const aspectRatio = img.aspectRatio || "1:1";

      // `gpt-image-*` accepts only 1024x1024 / 1536x1024 / 1024x1536 and
      // rejects `response_format` outright; DALL·E uses its own size set.
      const isDallE = model.includes("dall-e");
      let size: ImageGenerateParamsNonStreaming["size"] = "1024x1024";
      if (aspectRatio === "16:9") {
        size = isDallE ? "1792x1024" : "1536x1024";
      } else if (aspectRatio === "9:16" || aspectRatio === "4:5") {
        size = isDallE ? "1024x1792" : "1024x1536";
      }

      const generateParams: ImageGenerateParamsNonStreaming = {
        model,
        prompt,
        n: 1,
        size,
      };

      if (isDallE) {
        generateParams.quality = quality === "high" ? "hd" : "standard";
      } else if (quality === "low" || quality === "medium") {
        generateParams.quality = quality;
      }

      const response = await client.images.generate(generateParams);
      const image = response.data?.[0];
      // gpt-image-* returns base64; a URL response is fetched so both shapes
      // land in the same storage path.
      let buffer: Buffer | undefined;
      if (image?.b64_json) {
        buffer = Buffer.from(image.b64_json, "base64");
      } else if (image?.url) {
        const res = await fetch(image.url, { signal: exec.signal });
        const bytes = new Uint8Array(
          (await res.arrayBuffer()) as unknown as ArrayBufferLike,
        );
        buffer = Buffer.from(bytes);
      }
      if (!buffer) {
        throw new Error(
          `OpenAI image generation succeeded but returned empty image data for item ${i + 1}.`,
        );
      }
      const saved = await saveAttachment({
        buffer,
        filename: "generated_visual.png",
        mediaType: "image/png",
        storage: storageTier,
        userId: toolSession<Session>(exec).userId,
      });

      generatedResults.push({
        prompt,
        title,
        aspectRatio,
        attachmentUrl: saved.url,
      });
    }

    const lines = [
      `### Generated Visual Assets (${generatedResults.length} creative${generatedResults.length === 1 ? "" : "s"})\n`,
      ...generatedResults.map(
        (g) =>
          `- **${g.title}** (${g.aspectRatio}): ${g.attachmentUrl}\n  *Prompt*: ${g.prompt}`,
      ),
    ];

    return {
      images: generatedResults,
      summary: lines.join("\n"),
    };
  },
});
