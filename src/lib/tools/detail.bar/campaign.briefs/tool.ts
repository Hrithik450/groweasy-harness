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
import { saveArtifact } from "@/lib/tools/artifact.save";

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
          "Flat UI-block spec { root, elements } for the brief page. The tool validates it, saves it and displays it in chat — do not render the report with renderUIBlock.",
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
    blocks = args.blocks as Record<string, unknown>;
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

  // A title-only update reuses the stored spec; a save always validates and
  // displays the brief itself.
  const rawSpec = blocks ?? existing?.blocks;
  if (rawSpec == null || typeof rawSpec !== "object") {
    return errorResult(
      "Missing required argument 'blocks': a brief has no report content to show without it.",
    );
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

  const saved = await saveArtifact({
    rawSpec,
    skillName: "campaign-brief",
    context: input.context,
    persist: (spec) => {
      upsertDetailBarItems(session, "campaignBriefs", [
        { id, data: { ...data, blocks: spec } },
      ]);
    },
  });

  if (!saved.ok) {
    return errorResult(saved.error);
  }

  const url = ` View it at /c/${session.id}/briefs/${id}.`;

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `Saved campaign brief "${title}" as ${id} and displayed it in chat.${url}`,
        },
      ],
    },
  };
}
