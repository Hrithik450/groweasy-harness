import type { Session } from "@openai-harness/session";
import type {
  CompetitorResearchItem,
  AdStrategistDetailBarData,
} from "@openai-harness/client-ui-detail-bar";
import { getConnectorByUserIdAndSlug } from "@openai-harness/connector";
import {
  getSessionByUserIdAndSlug,
  mutateDetailBarState,
} from "@openai-harness/session-persistence";
import { getScrapedAdsByIds } from "@openai-harness/scraper";
import { extractAdIdFromReference } from "@openai-harness/scraper";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";
import { latestMessageId } from "@openai-harness/session";

export interface SaveCompetitorResearchArgs {
  title: string;
  content: string;
  newCompetitors?: string[];
  newKeywords?: string[];
  newAds?: {
    staticAds?: string[];
    videoAds?: string[];
  };
}

export const saveCompetitorResearchTool = defineTool({
  name: "saveCompetitorResearch",
  description:
    "Persists competitive intelligence findings, identified competitor brands, discovered search keywords, and winning ad IDs into the Ad Strategist DetailBar in real-time.",
  timeoutMs: 15000,
  isConcurrencySafe: () => false,
  parameters: {
    title: {
      type: "string",
      required: true,
      description:
        "3-4 words concise, high-impact title for the research topic (e.g. 'WhatsApp Automation Meta Ads', 'Shopify Abandoned Cart Video Ads').",
    },
    content: {
      type: "string",
      required: true,
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
      additionalProperties: true,
      description: "Object containing staticAds and videoAds arrays.",
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
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ title: value.title }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "edit",
    title: `Save competitor research: "${args.title}"`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "edit",
    title: `Competitor research saved: ${(result.meta as any)?.title ?? ""}`,
    content: result.content,
  }),
  async execute(args, exec) {
    const session = toolSession<Session>(exec);
    const userId = session.userId;
    if (!userId) {
      throw new Error(
        "User authentication context is required to save competitor research.",
      );
    }

    const title = args.title?.trim();
    if (!title) {
      throw new Error("Missing required argument 'title'.");
    }

    let brandUrl: string | undefined;
    try {
      const connectorRes = await getConnectorByUserIdAndSlug(
        userId,
        "businessProfile",
      );
      const connector = connectorRes?.data;
      if (connector && connector.status === "connected" && connector.metadata) {
        const metadata = connector.metadata as { url?: string };
        if (typeof metadata?.url === "string" && metadata.url.trim()) {
          brandUrl = metadata.url.trim();
        }
      }
    } catch {
      // ignore
    }

    const rawStatic = Array.isArray(args.newAds?.staticAds)
      ? args.newAds.staticAds
      : [];
    const rawVideo = Array.isArray(args.newAds?.videoAds)
      ? args.newAds.videoAds
      : [];

    const uniqueStatic = Array.from(
      new Set(
        rawStatic
          .map((a) => extractAdIdFromReference(String(a)) || String(a).trim())
          .filter(Boolean),
      ),
    );

    const uniqueVideo = Array.from(
      new Set(
        rawVideo
          .map((a) => extractAdIdFromReference(String(a)) || String(a).trim())
          .filter(Boolean),
      ),
    );

    const allSubmittedIds = Array.from(
      new Set([...uniqueStatic, ...uniqueVideo]),
    );

    if (allSubmittedIds.length > 0) {
      const cachedAdsRes = await getScrapedAdsByIds(allSubmittedIds);
      const cachedMap = cachedAdsRes.data ?? new Map();

      const invalidIds = allSubmittedIds.filter((id) => !cachedMap.has(id));
      if (invalidIds.length > 0) {
        throw new Error(
          `Invalid ad ID(s): [${invalidIds.join(", ")}]. All submitted ads must be verified ads previously retrieved and cached from Meta Ad Library via the 'searchAdLibrary' tool. Please provide valid ad IDs.`,
        );
      }
    }

    const researchItem: CompetitorResearchItem = {
      title,
      content: (args.content || "").trim(),
      messageId: latestMessageId(session, "assistant") ?? "",
      brandUrl,
      newCompetitors: Array.isArray(args.newCompetitors)
        ? args.newCompetitors.map((c) => String(c).trim()).filter(Boolean)
        : [],
      newKeywords: Array.isArray(args.newKeywords)
        ? args.newKeywords.map((k) => String(k).trim()).filter(Boolean)
        : [],
      newAds: {
        staticAds: uniqueStatic,
        videoAds: uniqueVideo,
      },
      createdAt: new Date().toISOString(),
    };

    const sessionRes = await getSessionByUserIdAndSlug(userId, "adStrategist");
    if (!sessionRes.success || !sessionRes.data) {
      throw new Error(sessionRes.error || "Ad Strategist session not found.");
    }

    const targetSession = sessionRes.data;

    await mutateDetailBarState(targetSession.id, "adStrategist", (current) => {
      const currentData = current.data as unknown as AdStrategistDetailBarData;
      return {
        ...current,
        type: "adStrategist",
        data: {
          ...currentData,
          competitorResearches: [
            researchItem,
            ...(currentData.competitorResearches ?? []),
          ],
        },
      };
    });

    return {
      title,
      summary: `Successfully saved competitor research "${researchItem.title}" to the session's Ad Strategist DetailBar.`,
    };
  },
});
