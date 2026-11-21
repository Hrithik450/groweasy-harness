import {
  uploadImageCreative,
  uploadVideoCreative,
} from "@/lib/connectors/meta.ads";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

/** Meta's `/adimages` cap. */
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
/** Single-request `/advideos` cap; larger files need Meta's resumable upload. */
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

export const uploadMetaAssetToolDefinition = {
  type: "function" as const,
  name: "uploadMetaAsset",
  description:
    "Upload a public image or video URL into the Meta ad account. Images return an image hash; videos return a video id. Use it as `creative.imageHash` or `creative.videoId` when creating an ad.",
  parameters: {
    type: "object",
    properties: {
      adAccountId: {
        type: "string",
        description: "Meta ad account id, e.g. 'act_123456789'.",
      },
      mediaUrl: {
        type: "string",
        description:
          'Publicly reachable media URL. Images max 30 MB; videos max 1 GB. (e.g.: "https://cdn.example.com/ad.jpg").',
      },
      kind: {
        type: "string",
        enum: ["image", "video"],
        description: "Asset kind.",
      },
      filename: {
        type: "string",
        description: "Optional filename; derived from the URL when omitted.",
      },
    },
    required: ["adAccountId", "mediaUrl", "kind"],
  },
};

function safeFilename(url: string, fallback: string): string {
  try {
    const name = new URL(url).pathname.split("/").pop() ?? "";
    return name && name.includes(".") ? name : fallback;
  } catch {
    return fallback;
  }
}

export interface UploadMetaAssetArgs {
  mediaUrl?: string;
  kind?: "image" | "video";
  adAccountId?: string;
  filename?: string;
}

export async function executeUploadMetaAssetTool(
  input: ToolInput<UploadMetaAssetArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  const adAccountId = input.args?.adAccountId?.trim();
  const mediaUrl = input.args?.mediaUrl?.trim();
  const kind = input.args?.kind;

  if (!userId) return failure("User authentication context required.");
  if (!adAccountId || !mediaUrl || !kind) {
    return failure("adAccountId, mediaUrl, and type are required.");
  }
  if (kind !== "image" && kind !== "video") {
    return failure("type must be 'image' or 'video'.");
  }
  if (!/^https?:\/\//i.test(mediaUrl))
    return failure("mediaUrl must be http(s).");

  const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

  try {
    const media = await fetch(mediaUrl, {
      signal: AbortSignal.timeout(kind === "image" ? 30000 : 120000),
    });
    if (!media.ok) {
      return failure(`Media download failed (${media.status}).`);
    }
    const declared = Number(media.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      return failure(
        kind === "image"
          ? "Image exceeds Meta's 30 MB upload limit."
          : "Video exceeds the 1 GB single-upload limit.",
      );
    }
    const buffer = Buffer.from(await media.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      return failure(
        kind === "image"
          ? "Image exceeds Meta's 30 MB upload limit."
          : "Video exceeds the 1 GB single-upload limit.",
      );
    }

    const filename =
      input.args?.filename?.trim() ||
      safeFilename(
        mediaUrl,
        kind === "image" ? "ad-image.png" : "ad-video.mp4",
      );

    if (kind === "image") {
      const upload = await uploadImageCreative({
        params: { adAccountId, image: buffer, filename },
        context: { userId, providerSlug: "meta" },
      });
      if (!upload.success || !upload.data?.hash) {
        return failure(upload.error?.message || "Meta returned no image hash.");
      }
      return {
        success: true,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: JSON.stringify({
                imageHash: upload.data.hash,
                url: upload.data.url,
              }),
            },
          ],
        },
      };
    }

    const upload = await uploadVideoCreative({
      params: { adAccountId, video: buffer, filename },
      context: { userId, providerSlug: "meta" },
    });
    if (!upload.success || !upload.data?.id) {
      return failure(upload.error?.message || "Meta returned no video id.");
    }
    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: JSON.stringify({ videoId: upload.data.id }),
          },
        ],
      },
    };
  } catch (err: unknown) {
    return failure(err instanceof Error ? err.message : "Media upload failed.");
  }
}
