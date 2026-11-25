import { uuidv7 } from "@/lib/utils/uuid";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { CompetitorResearchItem } from "@/lib/detail.bar/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { extractAdIdFromReference } from "@/lib/meta.ad.library/ad.scraper";
import { getScrapedAdsByIds } from "@/lib/meta.ad.library/ad.scraper";
import {
  upsertDetailBarItems,
  resolveDetailBarSession,
} from "@/lib/detail.bar/service";
import { saveArtifact } from "@/lib/tools/artifact.save";

export const saveCompetitorResearchToolDefinition = {
  type: "function" as const,
  name: "saveCompetitorResearch",
  preSkills: "competitor-research",
  description:
    "Prerequisite: competitor-research skill is a prerequisite.\n\n" +
    "Saves a new competitive intelligence finding as a UI-block spec into the Ad Strategist Competitor research tab: competitor brands, search keywords, and winning ad IDs. Research rows are append-only; read previous research first and save only new findings.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "3-4 words concise, high-impact title for the research topic (e.g. 'WhatsApp Automation Meta Ads', 'Shopify Abandoned Cart Video Ads').",
      },
      content: {
        type: "string",
        description:
          "20-30 words sentence strategic summary highlighting core findings, winning angles, pricing attacks, creative takeaways or anythiny etc.",
      },
      blocks: {
        type: "object",
        description:
          "Flat UI-block spec { root, elements } for the research report. The tool validates it, saves it and displays it in chat — do not render the report with renderUIBlock.",
        additionalProperties: true,
      },
      newCompetitors: {
        type: "array",
        items: { type: "string" },
        description:
          "Array of discovered competitor brand names (e.g. ['Pabbly Chatflow']).",
      },
      newKeywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Array of category keywords, broad keywords or product/service keyword phrases (e.g. ['Whatsapp automation']).",
      },
      newAds: {
        type: "object",
        properties: {
          staticAds: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of Meta Ad IDs for discovered static winning ads.",
          },
          videoAds: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of Meta Ad IDs for discovered video winning ads.",
          },
        },
        description: "Static and video ad IDs discovered during the research.",
      },
    },
    required: ["title", "content", "blocks"],
  },
};

export type SaveCompetitorResearchArgs = Partial<
  Omit<CompetitorResearchItem, "id" | "createdAt" | "sourceSessionId">
>;

export async function executeSaveCompetitorResearchTool(
  input: ToolInput<SaveCompetitorResearchArgs>,
): Promise<
  ToolOutput<{
    contentParts: Array<InputContentParam>;
  }>
> {
  const userId = input.context?.userId;
  const context = input.context;

  if (!userId) {
    const errorMsg =
      "User authentication context is required to save competitor research.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const {
    title,
    content,
    newCompetitors = [],
    newKeywords = [],
    newAds = {},
  } = input.args || {};

  if (!title || !title.trim()) {
    const errorMsg = "Missing required argument 'title'.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  try {
    if (input.args?.blocks == null) {
      const errorMsg = "Missing required argument 'blocks'.";
      return {
        success: false,
        data: {
          contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
        },
        error: errorMsg,
      };
    }

    const rawStatic = Array.isArray(newAds?.staticAds) ? newAds.staticAds : [];
    const rawVideo = Array.isArray(newAds?.videoAds) ? newAds.videoAds : [];

    let uniqueStatic = Array.from(
      new Set(
        rawStatic
          .map((a) => extractAdIdFromReference(String(a)) || String(a).trim())
          .filter(Boolean),
      ),
    );

    let uniqueVideo = Array.from(
      new Set(
        rawVideo
          .map((a) => extractAdIdFromReference(String(a)) || String(a).trim())
          .filter(Boolean),
      ),
    );

    const allSubmittedIds = Array.from(
      new Set([...uniqueStatic, ...uniqueVideo]),
    );
    let droppedIds: string[] = [];

    if (allSubmittedIds.length > 0) {
      const cachedMap = getScrapedAdsByIds(allSubmittedIds);

      const invalidIds = allSubmittedIds.filter((id) => !cachedMap.has(id));
      if (invalidIds.length > 0) {
        const invalid = new Set(invalidIds);
        uniqueStatic = uniqueStatic.filter((id) => !invalid.has(id));
        uniqueVideo = uniqueVideo.filter((id) => !invalid.has(id));
        droppedIds = invalidIds;
      }
    }

    const session = resolveDetailBarSession(userId, "competitorResearches");
    if (!session) {
      const errorMsg =
        "Session not found for this user; competitor research was not saved.";
      return {
        success: false,
        data: {
          contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
        },
        error: errorMsg,
      };
    }

    const id = uuidv7();

    const data: Record<string, unknown> = {
      title: title.trim(),
      content: (content || "").trim(),
      sourceSessionId: context?.sessionId ?? "",
      newCompetitors: Array.isArray(newCompetitors)
        ? newCompetitors.map((c) => String(c).trim()).filter(Boolean)
        : [],
      newKeywords: Array.isArray(newKeywords)
        ? newKeywords.map((k) => String(k).trim()).filter(Boolean)
        : [],
      newAds: {
        staticAds: uniqueStatic,
        videoAds: uniqueVideo,
      },
      createdAt: new Date().toISOString(),
    };

    const saved = await saveArtifact({
      rawSpec: input.args?.blocks,
      skillName: "competitor-research",
      context,
      persist: (spec) => {
        upsertDetailBarItems(session, "competitorResearches", [
          { id, data: { ...data, blocks: spec } },
        ]);
      },
    });

    if (!saved.ok) {
      return {
        success: false,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `Error: ${saved.error}`,
            },
          ],
        },
        error: saved.error,
      };
    }

    const writtenId = id;
    const url = ` View it at /c/${session.id}/research/${writtenId}.`;

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Successfully saved competitor research "${String(data.title)}" as ${writtenId} in the session and displayed it in chat.${url}${
              droppedIds.length > 0
                ? ` Dropped ${droppedIds.length} unverified ad reference(s) not returned by searchAdLibrary: ${droppedIds.join(", ")}.`
                : ""
            }`,
          },
        ],
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Error saving competitor research: ${errorMsg}`,
          },
        ],
      },
      error: errorMsg,
    };
  }
}
