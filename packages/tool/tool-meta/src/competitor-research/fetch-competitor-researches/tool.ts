import type { Session } from "@openai-harness/session";
import { getConnectorByUserIdAndSlug } from "@openai-harness/connector";
import { getCompetitorResearches } from "../history";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface FetchCompetitorResearchesArgs {
  limit?: number;
  cursor?: string;
}

export const fetchCompetitorResearchesTool = defineTool({
  name: "fetchCompetitorResearches",
  description:
    "Retrieves saved competitors researches from the memory. Allows reviewing previously discovered rival brands, search keywords, winning ad angles, and creative takeaways.",
  timeoutMs: 15000,
  isConcurrencySafe: () => true,
  parameters: {
    limit: {
      type: "number",
      description:
        "Maximum number of recent competitor research items to retrieve (defaults to 10, max 50).",
    },
    cursor: {
      type: "string",
      description:
        "Optional ISO 8601 timestamp cursor (createdAt) to fetch competitor research items created before this timestamp.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        total: { type: "number", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ total: value.total }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "fetch",
    title: `Fetch competitor research (limit: ${args.limit ?? 10})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "fetch",
    title: `Competitor research fetched (${(result.meta as any)?.total ?? 0} items)`,
    content: result.content,
  }),
  async execute(args, exec) {
    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error(
        "User authentication context is required to fetch competitor researches.",
      );
    }

    const limit =
      typeof args.limit === "number" && args.limit > 0
        ? Math.min(Math.floor(args.limit), 50)
        : 10;

    let activeBrandUrl: string | undefined;
    try {
      const connectorRes = await getConnectorByUserIdAndSlug(
        userId,
        "businessProfile",
      );
      const connector = connectorRes?.data;
      if (connector && connector.status === "connected" && connector.metadata) {
        const metadata = connector.metadata as { url?: string };
        if (typeof metadata?.url === "string" && metadata.url.trim()) {
          activeBrandUrl = metadata.url.trim();
        }
      }
    } catch {
      // ignore
    }

    const items = await getCompetitorResearches(userId, activeBrandUrl);
    if (items.length === 0) {
      return {
        total: 0,
        summary: "No saved competitor researches found.",
      };
    }

    const lines: string[] = [
      `### Competitor Researches (${items.length} retrieved)\n`,
    ];

    for (const item of items) {
      lines.push(
        `#### ${item.title} (${new Date(item.createdAt).toLocaleDateString()})\n` +
          `${item.content}\n` +
          (item.newCompetitors?.length
            ? `- Competitors: ${item.newCompetitors.join(", ")}\n`
            : "") +
          (item.newKeywords?.length
            ? `- Keywords: ${item.newKeywords.join(", ")}\n`
            : "") +
          (item.newAds?.staticAds?.length
            ? `- Static Ads: ${item.newAds.staticAds.join(", ")}\n`
            : "") +
          (item.newAds?.videoAds?.length
            ? `- Video Ads: ${item.newAds.videoAds.join(", ")}\n`
            : ""),
      );
    }

    return {
      total: items.length,
      summary: lines.join("\n"),
    };
  },
});
