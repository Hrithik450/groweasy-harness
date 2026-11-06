import type { Session } from "@openai-harness/session";
import {
  AttachmentError,
  AttachmentId,
  attachmentStoreFor,
  isImageAttachmentRef,
  publicUrlFor,
  resolveImageRef,
  saveAttachment,
  type ImageAttachmentRef,
  type ImageMediaType,
} from "@openai-harness/attachment-r2";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";
import type { ContentBlock } from "@openai-harness/llm";
import { REQUEST_IMAGE_TARGET } from "@openai-harness/llm-openai";

/** One successfully inspected image, carrying both master and request facts. */
interface InspectedImage {
  ref: ImageAttachmentRef;
  requestWidth: number;
  requestHeight: number;
  requestBytes: number;
}

function isRemote(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Resolve one image input to a durable image reference.
 *
 * Remote URLs are admitted through the same store as uploads, so downstream
 * code only ever sees this tenant's content-addressed references.
 */
async function resolveInputImage(
  urlOrId: string,
  tenantId: string,
): Promise<ImageAttachmentRef> {
  if (!isRemote(urlOrId)) {
    return resolveImageRef(urlOrId, tenantId);
  }

  const response = await fetch(urlOrId);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching remote image.`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const saved = await saveAttachment(
    buffer,
    {
      mimeType: response.headers.get("content-type") ?? undefined,
      filename: new URL(urlOrId).pathname.split("/").pop() || "remote-image",
      storage: "tmp",
    },
    tenantId,
  );
  if (!isImageAttachmentRef(saved.ref)) {
    throw new Error("Remote resource is not an image.");
  }
  return saved.ref;
}

export const readImagesTool = defineTool({
  name: "readImages",
  description:
    "Reads and visually inspects one or multiple images (uploaded by the user or previously generated). " +
    "Pass each image as its attachment id (`sha256:<hex>`) or `/api/attachments/<attachmentId>` URL. " +
    "The stored master image is unchanged; the model receives a request-sized variant. " +
    "Every inspected image is returned as an image content block tagged with its attachment id.",
  timeoutMs: 60000,
  isConcurrencySafe: () => true,
  parameters: {
    images: {
      type: "array",
      required: true,
      description: "List of images to visually inspect.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: {
            type: "string",
            required: true,
            description:
              "Attachment id (`sha256:<hex>`) or `/api/attachments/<attachmentId>` URL of the image.",
          },
        },
      },
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        totalInspected: { type: "number", required: true },
        summary: { type: "string", required: true },
        images: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              attachmentId: { type: "string", required: true },
              url: { type: "string", required: true },
              mediaType: { type: "string", required: true },
              width: { type: "number", required: true },
              height: { type: "number", required: true },
              bytes: { type: "number", required: true },
              requestWidth: { type: "number", required: true },
              requestHeight: { type: "number", required: true },
              requestBytes: { type: "number", required: true },
            },
          },
        },
      },
    },
    render: (_args, value) => {
      const blocks: ContentBlock[] = [];
      const images = Array.isArray(value.images) ? value.images : [];

      images.forEach((raw, index) => {
        const image = raw as Record<string, unknown>;
        const attachmentId = String(image.attachmentId);
        const mediaType = String(image.mediaType) as ImageMediaType;
        const ref: ImageAttachmentRef = {
          attachmentId: AttachmentId(attachmentId),
          mediaType,
          bytes: Number(image.bytes),
          width: Number(image.width),
          height: Number(image.height),
        };

        blocks.push({
          type: "text",
          text: [
            `### Image ${index + 1} (attachment: ${ref.attachmentId})`,
            `- Intrinsic dimensions: ${ref.width}x${ref.height}`,
            `- Media type: ${mediaType}`,
            `- Byte size: ${ref.bytes} bytes`,
            `- Request version: ${Number(image.requestWidth)}x${Number(image.requestHeight)} (${Number(image.requestBytes)} bytes). The dimensions above report the stored master; the model sees this request variant.`,
          ].join("\n"),
        });
        blocks.push({
          type: "image",
          ref,
          mimeType: mediaType,
          width: Number(image.requestWidth),
          height: Number(image.requestHeight),
          alt: `Inspected image ${index + 1}`,
        });
      });

      if (blocks.length === 0) {
        blocks.push({ type: "text", text: String(value.summary) });
      }

      return blocks;
    },
    presentationMeta: (_args, value) => ({
      totalInspected: value.totalInspected,
    }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "read",
    title: `Inspect images (${args.images?.length ?? 0} items)`,
    locations: args.images?.map((img) => ({ path: img.url })),
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "read",
    title: `Images inspected (${(result.meta as any)?.totalInspected ?? 0} images)`,
    content: result.content,
  }),
  async execute(args, exec) {
    const rawImages = Array.isArray(args.images) ? args.images : [];
    if (rawImages.length === 0) {
      throw new Error(
        "No images provided. Please specify { images: [{ url: '...' }] }.",
      );
    }

    const tenantId = toolSession<Session>(exec).userId;
    if (!tenantId) {
      throw new Error("readImages requires an authenticated tenant.");
    }

    const inspected: InspectedImage[] = [];
    const errors: string[] = [];

    for (let index = 0; index < rawImages.length; index++) {
      const rawUrl = rawImages[index]?.url?.trim();
      if (!rawUrl) continue;

      try {
        const ref = await resolveInputImage(rawUrl, tenantId);
        const requestImage = await attachmentStoreFor(tenantId).readImageRequest(
          ref,
          REQUEST_IMAGE_TARGET,
        );
        inspected.push({
          ref,
          requestWidth: requestImage.width,
          requestHeight: requestImage.height,
          requestBytes: requestImage.bytes,
        });
      } catch (error: unknown) {
        const message =
          error instanceof AttachmentError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        errors.push(`- Image ${index + 1} (\`${rawUrl}\`): ${message}`);
      }
    }

    if (inspected.length === 0) {
      throw new Error(
        `Failed to inspect any requested image(s):\n${errors.join("\n")}`,
      );
    }

    const lines = [
      `### Inspected Images (${inspected.length}/${rawImages.length} successful)`,
      ...inspected.map(
        (image, index) =>
          `- **Image ${index + 1}** (attachment: \`${image.ref.attachmentId}\`): stored ${image.ref.width}x${image.ref.height} ${image.ref.mediaType}, request variant ${image.requestWidth}x${image.requestHeight} (${image.requestBytes} bytes)`,
      ),
    ];
    if (errors.length > 0) {
      lines.push("", "### Failed Images", ...errors);
    }

    return {
      totalInspected: inspected.length,
      summary: lines.join("\n"),
      images: inspected.map((image) => ({
        attachmentId: image.ref.attachmentId,
        url: publicUrlFor(image.ref),
        mediaType: image.ref.mediaType,
        width: image.ref.width,
        height: image.ref.height,
        bytes: image.ref.bytes,
        requestWidth: image.requestWidth,
        requestHeight: image.requestHeight,
        requestBytes: image.requestBytes,
      })),
    };
  },
});
