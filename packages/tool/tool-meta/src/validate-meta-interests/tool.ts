import type { Session } from "@openai-harness/session";
import { getConnectorByUserIdAndProviderSlug } from "@openai-harness/connector";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface ValidateMetaInterestsArgs {
  interestQuery: string;
}

export interface MetaInterestItem {
  id: string;
  name: string;
  audience_size_lower_bound: number;
  audience_size_upper_bound: number;
  path: string[];
  description?: string;
  topic?: string;
}

function formatInterestsAsMarkdown(
  query: string,
  interests: MetaInterestItem[],
  source: string,
): string {
  if (interests.length === 0) {
    return `No matching Meta advertising interests found for "${query}".`;
  }

  const header = `### Meta Audience Interests for "${query}" (Source: ${source})\n\nFound ${interests.length} validated interest target(s):\n\n`;

  const items = interests
    .map((item) => {
      const lowerMillions = (
        item.audience_size_lower_bound / 1_000_000
      ).toFixed(1);
      const upperMillions = (
        item.audience_size_upper_bound / 1_000_000
      ).toFixed(1);
      const audienceRange = `${lowerMillions}M – ${upperMillions}M users`;

      return [
        `- **${item.name}**`,
        `  - **Interest ID**: \`${item.id}\``,
        `  - **Audience Size**: ${audienceRange} (${item.audience_size_lower_bound.toLocaleString()} to ${item.audience_size_upper_bound.toLocaleString()})`,
        item.topic ? `  - **Category**: ${item.topic}` : null,
        item.path && item.path.length > 0
          ? `  - **Targeting Path**: ${item.path.join(" > ")}`
          : null,
        item.description ? `  - **Description**: ${item.description}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return header + items;
}

export const validateMetaInterestsTool = defineTool({
  name: "validateMetaInterests",
  description:
    "Validate whether proposed target interests or keywords exist on Meta (Facebook & Instagram) and fetch their exact audience size lower and upper bounds, topic category, and targeting path using the Meta Marketing Graph API.",
  timeoutMs: 30000,
  isConcurrencySafe: () => true,
  parameters: {
    interestQuery: {
      type: "string",
      required: true,
      description:
        "The interest keyword or category to validate on Meta (e.g. 'Clothing', 'Sustainable fashion', 'Handicraft', 'Interior design').",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        totalFound: { type: "number", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ count: (value as any).interests?.length ?? 0 }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "search",
    title: `Validate Meta interests: "${args.interestQuery}"`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "search",
    title: `Meta interests validated (${(result.meta as any)?.count ?? 0} matches)`,
    content: result.content,
  }),
  async execute(args, exec) {
    const rawQuery = (args.interestQuery || "").trim();
    if (!rawQuery) {
      throw new Error("Missing required interestQuery parameter.");
    }

    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error("User context required to validate Meta interests.");
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const token =
      connectorRes.data?.accessToken || process.env.META_ACCESS_TOKEN;

    if (!token) {
      throw new Error(
        "Meta access token is missing or connector is not authenticated. Please connect Meta in settings.",
      );
    }

    const encodedQuery = encodeURIComponent(rawQuery);
    const graphUrl = `https://graph.facebook.com/v22.0/search?type=adinterest&q=${encodedQuery}&limit=10&access_token=${token}`;

    const res = await fetch(graphUrl);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Meta Graph API error (${res.status}): ${errText}`);
    }

    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name: string;
        audience_size_lower_bound?: number;
        audience_size_upper_bound?: number;
        path?: string[];
        description?: string;
        topic?: string;
      }>;
    };

    const rawList = Array.isArray(json.data) ? json.data : [];
    const interests: MetaInterestItem[] = rawList.map((item) => ({
      id: String(item.id),
      name: String(item.name),
      audience_size_lower_bound: Number(item.audience_size_lower_bound || 0),
      audience_size_upper_bound: Number(item.audience_size_upper_bound || 0),
      path: Array.isArray(item.path) ? item.path : [],
      description: item.description,
      topic: item.topic,
    }));

    const summary = formatInterestsAsMarkdown(
      rawQuery,
      interests,
      "Live Meta Marketing Graph API v22.0",
    );

    return {
      totalFound: interests.length,
      summary,
    };
  },
});
