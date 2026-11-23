import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as errorResult } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  readBarItemFor,
  upsertDetailBarItems,
  resolveDetailBarSession,
} from "@/lib/detail.bar/service";
import { uuidv7 } from "@/lib/utils/uuid";
import {
  IDEA_SOURCES,
  type BarCard,
  type Idea,
  type IdeaSource,
} from "@/lib/detail.bar/types";
import { isRenderableAssetUrl } from "@/lib/attachments/asset.url";

/** Idea cards accepted per call; the list keeps the rest. */
const MAX_IDEAS_PER_CALL = 10;

type SaveIdeasOutput = {
  contentParts: Array<InputContentParam>;
};

export const updateIdeasToolDefinition = {
  type: "function" as const,
  name: "updateIdeas",
  preSkills: "ideas",
  description:
    "Prerequisite: ideas skill is a prerequisite.\n\n" +
    "Saves ranked ad-idea cards into the Ad Creator Ideas tab. Omit `id` to add a new idea; pass an existing `id` to update that card in place.",
  parameters: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        description:
          "1 to 10 ranked idea cards. Later calls append; a repeated `id` updates the existing card.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "Existing idea ID to update. Omit to create a new card.",
            },
            title: {
              type: "string",
              description: "Card headline, max 8 words.",
            },
            description: {
              type: "string",
              description: "What the idea is, 20-40 words.",
            },
            source: {
              type: "string",
              enum: [...IDEA_SOURCES],
              description: "Source chip shown on the card.",
            },
            format: {
              type: "string",
              enum: ["video", "image"],
              description: "Planned creative format.",
            },
            mediaUrl: {
              type: "string",
              description:
                "The reference ad's own media: an '/api/attachments/…' URL or the ad's https URL. Required for a new card (omit `id`); an update may omit it and keeps the stored one.",
            },
            aspectRatio: {
              type: "string",
              description: "Media aspect ratio, e.g. '9:16', '1:1', '16:9'.",
            },
            sourceUrl: {
              type: "string",
              description: "Public link to the ad or post the idea references.",
            },
            hook: {
              type: "string",
              description: "Opening line or first three seconds.",
            },
            makeFor: {
              type: "string",
              description: "One line: what we make, for whom.",
            },
            why: {
              type: "string",
              description: "One line: why it should work.",
            },
          },
          required: ["source", "title", "description"],
        },
      },
    },
    required: ["ideas"],
  },
};

/** One idea as the tool accepts it; `createdAt` is stamped on save. */
export type IdeaItemInput = Partial<Omit<Idea, "createdAt">>;

export interface UpdateIdeasArgs {
  ideas?: IdeaItemInput[];
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function executeUpdateIdeasTool(
  input: ToolInput<UpdateIdeasArgs>,
): Promise<ToolOutput<SaveIdeasOutput>> {
  const userId = input.context?.userId;
  if (!userId) {
    return errorResult("User context is required to save ideas.");
  }

  const rawIdeas = input.args?.ideas;
  if (!Array.isArray(rawIdeas) || rawIdeas.length === 0) {
    return errorResult("The 'ideas' array parameter is required.");
  }

  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const items = [] as Array<{ id: string; data: Record<string, unknown> }>;
  const missing: number[] = [];
  const missingMedia: number[] = [];

  rawIdeas.slice(0, MAX_IDEAS_PER_CALL).forEach((idea, index) => {
    const sourceRaw = trimmed(idea.source).toUpperCase();
    const source = (IDEA_SOURCES as readonly string[]).includes(sourceRaw)
      ? (sourceRaw as IdeaSource)
      : null;
    const title = trimmed(idea.title);
    const description = trimmed(idea.description);
    if (!source || !title || !description) {
      missing.push(index + 1);
      return;
    }

    const existingId = trimmed(idea.id);
    const stored = existingId
      ? (readBarItemFor(userId, "ideas", existingId) as BarCard<Idea> | null)
      : null;

    const data: Record<string, unknown> = {
      source,
      title,
      description,
      createdAt,
    };
    if (idea.format === "video" || idea.format === "image") {
      data.format = idea.format;
    }
    const hook = trimmed(idea.hook);
    if (hook) data.hook = hook;
    const makeFor = trimmed(idea.makeFor);
    if (makeFor) data.makeFor = makeFor;
    const why = trimmed(idea.why);
    if (why) data.why = why;

    // A new card must cite the ad it is modelled on; an update keeps the
    // stored reference. Without media the card cannot be formed.
    const mediaUrl =
      trimmed(idea.mediaUrl) || (stored ? trimmed(stored.mediaUrl) : "");
    if (!mediaUrl || !isRenderableAssetUrl(mediaUrl)) {
      missingMedia.push(index + 1);
      return;
    }
    data.mediaUrl = mediaUrl;

    const aspectRatio =
      trimmed(idea.aspectRatio) || (stored ? trimmed(stored.aspectRatio) : "");
    if (aspectRatio) data.aspectRatio = aspectRatio;
    const sourceUrl =
      trimmed(idea.sourceUrl) || (stored ? trimmed(stored.sourceUrl) : "");
    if (sourceUrl) data.sourceUrl = sourceUrl;

    items.push({
      id: existingId || uuidv7(),
      data,
    });
  });

  if (missing.length > 0) {
    return errorResult(
      `Idea card(s) ${missing.join(", ")} are missing a valid 'source', 'title', or 'description'.`,
    );
  }
  if (missingMedia.length > 0) {
    return errorResult(
      `Idea card(s) ${missingMedia.join(", ")} need a 'mediaUrl' — the reference ad the card is modelled on. A new idea cannot be saved without one.`,
    );
  }

  const session = resolveDetailBarSession(userId, "ideas");
  if (!session) {
    return errorResult("Ad Creator session not found.");
  }
  const saved = upsertDetailBarItems(session, "ideas", items);

  const summaries = saved
    .map((item) => `- ${item.id} ("${String(item.title)}")`)
    .join("\n");

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `Saved ${saved.length} idea(s) to the Ideas tab:\n${summaries}`,
        },
      ],
    },
  };
}
