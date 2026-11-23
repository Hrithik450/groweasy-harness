import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as errorResult } from "@/lib/tools/utils";
import {
  upsertDetailBarItems,
  resolveDetailBarSession,
} from "@/lib/detail.bar/service";
import { uuidv7 } from "@/lib/utils/uuid";
import type { Creative } from "@/lib/detail.bar/types";
import { isRenderableAssetUrl } from "@/lib/attachments/asset.url";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

/** Finished assets accepted per call. */
const MAX_CREATIVES_PER_CALL = 10;

export const updateCreativesToolDefinition = {
  type: "function" as const,
  name: "updateCreatives",
  preSkills: "creatives",
  description:
    "Prerequisite: creatives skill is a prerequisite.\n\n" +
    "Saves finished video or image creatives into the session. Omit `id` to add a new entry; pass an existing `id` to update that entry in place.",
  parameters: {
    type: "object",
    properties: {
      creatives: {
        type: "array",
        description:
          "1 to 10 finished assets. One entry per asset; a repeated `id` updates that entry.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "Existing creative ID to update. Omit to create a new entry.",
            },
            title: {
              type: "string",
              description: "Creative name, max 6 words.",
            },
            type: {
              type: "string",
              enum: ["video", "image"],
              description: "Asset type.",
            },
            mediaUrl: {
              type: "string",
              description:
                "The asset itself: an '/api/attachments/…' URL from a render/composition tool, or an https URL.",
            },
            aspectRatio: {
              type: "string",
              description: "Verified ratio, e.g. '9:16', '4:5', '1:1', '16:9'.",
            },
            description: {
              type: "string",
              description: "What the asset shows, 15-30 words.",
            },
          },
          required: ["title", "type", "aspectRatio", "description", "mediaUrl"],
        },
      },
    },
    required: ["creatives"],
  },
};

/** One creative as the tool accepts it; `createdAt` is stamped on save. */
export type CreativeItemInput = Partial<Omit<Creative, "createdAt">>;

export interface UpdateCreativesArgs {
  creatives?: CreativeItemInput[];
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function executeUpdateCreativesTool(
  input: ToolInput<UpdateCreativesArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    return errorResult("User context is required to save creatives.");
  }

  const rawCreatives = input.args?.creatives;
  if (!Array.isArray(rawCreatives) || rawCreatives.length === 0) {
    return errorResult("The 'creatives' array parameter is required.");
  }

  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const items = [] as Array<{ id: string; data: Record<string, unknown> }>;
  const invalid: number[] = [];

  rawCreatives.slice(0, MAX_CREATIVES_PER_CALL).forEach((creative, index) => {
    const title = trimmed(creative.title);
    const aspectRatio = trimmed(creative.aspectRatio);
    const description = trimmed(creative.description);
    const mediaUrl = trimmed(creative.mediaUrl);
    const type = creative.type;
    if (
      !title ||
      !aspectRatio ||
      !description ||
      (type !== "video" && type !== "image") ||
      !isRenderableAssetUrl(mediaUrl)
    ) {
      invalid.push(index + 1);
      return;
    }

    const data: Record<string, unknown> = {
      title,
      type,
      aspectRatio,
      description,
      mediaUrl,
      createdAt,
    };

    items.push({
      id: trimmed(creative.id) || uuidv7(),
      data,
    });
  });

  if (invalid.length > 0) {
    return errorResult(
      `Creative(s) ${invalid.join(", ")} are missing a title, aspect ratio, description, or valid type/status.`,
    );
  }

  const session = resolveDetailBarSession(userId, "creatives");
  if (!session) {
    return errorResult("Ad Creator session not found.");
  }
  const saved = upsertDetailBarItems(session, "creatives", items);

  const summaries = saved
    .map((item) => `- ${item.id} ("${String(item.title)}")`)
    .join("\n");

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `Saved ${saved.length} creative(s) to the session:\n${summaries}`,
        },
      ],
    },
  };
}
