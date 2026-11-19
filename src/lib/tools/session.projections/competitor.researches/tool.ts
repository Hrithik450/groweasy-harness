import { uuidv7 } from "@/lib/utils/uuid";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { CompetitorResearchItem } from "@/lib/detail.bar/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { getScrapedAdsByIds } from "@/lib/services/scraper";
import { extractAdIdFromReference } from "@/lib/services/utils";
import { readBarItemFor, saveBarItems } from "@/lib/bar/service";

export const updateCompetitorResearchToolDefinition = {
  type: "function" as const,
  name: "updateCompetitorResearch",
  preSkills: "competitor-research",
  description:
    "Prerequisite: competitor-research skill is a prerequisite.\n\n" +
    "Persists competitive intelligence findings, identified competitor brands, discovered search keywords, and winning ad IDs into the Ad Strategist DetailBar. Read previous research first and save only new findings.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Existing research id to update. Omit to record new findings.",
      },
      title: {
        type: "string",
        description:
          "3-4 words concise, high-impact title for the research topic (e.g. 'WhatsApp Automation Meta Ads', 'Shopify Abandoned Cart Video Ads').",
      },
      content: {
        type: "string",
        description:
          "20-30 words sentence strategic summary highlighting core findings, winning angles, pricing attacks, and creative takeaways.",
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
          "Array of high-performing hooks, category keywords, or angles identified (e.g. ['lifetime access']).",
      },
      newAds: {
        type: "object",
        properties: {
          staticAds: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of Meta Ad IDs or links for discovered static winning ads.",
          },
          videoAds: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of Meta Ad IDs or links for discovered video winning ads.",
          },
        },
        description: "Static and video ad IDs discovered during the research.",
      },
    },
    required: ["title", "content", "newCompetitors"],
  },
};

export type UpdateCompetitorResearchArgs = Partial<
  Omit<CompetitorResearchItem, "createdAt" | "turnId" | "sourceSessionId">
>;

type UpdateCompetitorResearchOutput = {
  contentParts: Array<InputContentParam>;
};

export async function executeUpdateCompetitorResearchTool(
  input: ToolInput<UpdateCompetitorResearchArgs>,
): Promise<ToolOutput<UpdateCompetitorResearchOutput>> {
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
    id: requestedId,
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
      const cachedAdsRes = await getScrapedAdsByIds(allSubmittedIds);
      const cachedMap = cachedAdsRes.data ?? new Map();

      const invalidIds = allSubmittedIds.filter((id) => !cachedMap.has(id));
      if (invalidIds.length > 0) {
        // Unverified references are dropped individually: one bad id must not
        // discard the competitors, keywords and findings of the whole run.
        const invalid = new Set(invalidIds);
        uniqueStatic = uniqueStatic.filter((id) => !invalid.has(id));
        uniqueVideo = uniqueVideo.filter((id) => !invalid.has(id));
        droppedIds = invalidIds;
      }
    }

    const id = requestedId?.trim() || uuidv7();
    const existing = requestedId?.trim()
      ? (readBarItemFor(userId, "competitorResearches", id) as CompetitorResearchItem | null)
      : null;

    const data: Record<string, unknown> = {
      title: title.trim(),
      content: (content || "").trim(),
      turnId: context?.turnId ?? "",
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
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    const saved = saveBarItems(userId, "competitorResearches", [{ id, data }]);
    if (!saved) {
      const errorMsg = "Ad Strategist session not found.";
      return {
        success: false,
        data: {
          contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
        },
        error: errorMsg,
      };
    }

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Successfully saved competitor research "${String(data.title)}" as ${id} in the Ad Strategist DetailBar.${
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
