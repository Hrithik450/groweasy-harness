import type { Session } from "@openai-harness/session";
import { executeMetaGraphQuery } from "@openai-harness/connector-meta";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface FetchMetaAdSetsArgs {
  queries?: string[];
}

export const fetchMetaAdSetsTool = defineTool({
  name: "fetchMetaAdSets",
  description:
    "Fetch advertising Ad Sets from Meta Ads Manager using free-form Meta Graph API queries (v22.0).",
  timeoutMs: 30000,
  isConcurrencySafe: () => true,
  parameters: {
    queries: {
      type: "array",
      required: true,
      items: { type: "string" },
      description:
        "Array of 1 to 5 free-form Meta Graph query strings to execute in parallel (e.g. ['act_123456789/adsets?fields=id,name,status,effective_status,targeting,optimization_goal&limit=25']).",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: true,
      properties: {
        summary: { type: "string", required: true },
        data: { type: "object", additionalProperties: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: (value as any).summary || JSON.stringify(value, null, 2),
      },
    ],
    presentationMeta: (_args, value) => value,
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "fetch",
    title: `Fetch Meta ad sets (${args.queries?.length ?? 0} queries)`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "fetch",
    title: "Meta ad sets retrieved",
    content: result.content,
  }),
  async execute(args, exec) {
    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error("User authentication context required to fetch Meta ad sets.");
    }

    const queries = args.queries || [];
    if (queries.length === 0) {
      throw new Error("The 'queries' array parameter is required to fetch ad sets.");
    }

    const res = await executeMetaGraphQuery({
      params: { queries },
      context: {
        userId,
        providerSlug: "meta",
      },
    });

    if (!res.success || !res.data) {
      throw new Error(
        res.error?.message || "Failed to fetch Meta ad sets from Graph API.",
      );
    }

    return {
      data: res.data as unknown as Record<string, any>,
      summary: JSON.stringify(res.data, null, 2),
    };
  },
});
