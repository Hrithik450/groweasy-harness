import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as errorResult } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  readBarItemFor,
  resolveDetailBarSession,
  upsertDetailBarItems,
} from "@/lib/detail.bar/service";
import { uuidv7 } from "@/lib/utils/uuid";
import type { CampaignBrief } from "@/lib/detail.bar/types";
import { validateAndNormalizeUI } from "@/lib/generative.ui";

export const updateCampaignBriefsToolDefinition = {
  type: "function" as const,
  name: "updateCampaignBriefs",
  preSkills: "campaign-brief",
  description:
    "Prerequisite: campaign-brief skill is a prerequisite.\n\n" +
    "Saves one campaign brief as a UI-block spec into the Ad Strategist Campaign brief tab. The saved brief opens on its own page, so it survives the chat scrolling away.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Existing brief id to update. Omit to create a new brief.",
      },
      title: {
        type: "string",
        description: "Brief title, max 8 words.",
      },
      summary: {
        type: "string",
        description:
          "Two-line gist of the brief: the objective and the one decision that matters. The full brief stays in the saved blocks.",
      },
      blocks: {
        type: "object",
        description:
          "Flat UI-block spec { root, elements } for the brief page: the same block you rendered in chat.",
        additionalProperties: true,
      },
    },
    required: ["title", "summary"],
  },
};

export type UpdateCampaignBriefsArgs = Partial<
  Omit<CampaignBrief, "createdAt" | "sourceSessionId">
>;

type UpdateCampaignBriefsOutput = {
  contentParts: Array<InputContentParam>;
};

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function executeUpdateCampaignBriefsTool(
  input: ToolInput<UpdateCampaignBriefsArgs>,
): Promise<ToolOutput<UpdateCampaignBriefsOutput>> {
  const userId = input.context?.userId;
  if (!userId) {
    return errorResult("User context is required to save a campaign brief.");
  }

  const args = input.args ?? {};
  const title = trimmed(args.title);
  const summary = typeof args.summary === "string" ? args.summary.trim() : "";

  if (!title) {
    return errorResult("Missing required argument 'title'.");
  }
  if (!summary) {
    return errorResult("Missing required argument 'summary'.");
  }
  if (summary.length > 240) {
    return errorResult(
      `'summary' is ${summary.length} characters; keep it under 240.`,
    );
  }

  let blocks: Record<string, unknown> | undefined;
  if (args.blocks != null) {
    try {
      const normalized = validateAndNormalizeUI(args.blocks);
      if (!normalized) {
        return errorResult("Missing required argument 'blocks'.");
      }
      blocks = normalized;
    } catch (err: unknown) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  }

  const now = Date.now();
  const id = trimmed(args.id) || uuidv7();
  const sourceSessionId = trimmed(input.context?.sessionId);

  const session = resolveDetailBarSession(userId, "campaignBriefs");
  const existing =
    session && trimmed(args.id)
      ? (readBarItemFor(userId, "campaignBriefs", id) as CampaignBrief | null)
      : null;
  if (!session) {
    return errorResult("Ad Strategist session not found.");
  }

  const data: Record<string, unknown> = {
    title,
    summary,
    createdAt: existing?.createdAt ?? new Date(now).toISOString(),
  };
  if (sourceSessionId) data.sourceSessionId = sourceSessionId;
  else if (existing?.sourceSessionId) {
    data.sourceSessionId = existing.sourceSessionId;
  }
  // Keep an existing spec on a title-only update; legacy rows stay spec-less.
  if (blocks !== undefined) data.blocks = blocks;
  else if (existing?.blocks) data.blocks = existing.blocks;

  upsertDetailBarItems(session, "campaignBriefs", [{ id, data }]);

  const url =
    data.blocks !== undefined
      ? ` View it at /c/${session.id}/briefs/${id}.`
      : "";

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `Saved campaign brief "${title}" as ${id}.${url}`,
        },
      ],
    },
  };
}
