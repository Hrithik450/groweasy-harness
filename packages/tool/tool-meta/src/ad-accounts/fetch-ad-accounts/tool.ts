import type { Session } from "@openai-harness/session";
import { executeMetaGraphQuery } from "@openai-harness/connector-meta";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface FetchMetaAdAccountsArgs {
  queries?: string[];
}

export const fetchMetaAdAccountsTool = defineTool({
  name: "fetchMetaAdAccounts",
  description:
    "Fetch Meta Ad Accounts accessible by the authenticated user using free-form Meta Graph API queries (v22.0).",
  timeoutMs: 30000,
  isConcurrencySafe: () => true,
  parameters: {
    queries: {
      type: "array",
      items: { type: "string" },
      description:
        "Optional Array of 1 to 5 free-form Meta Graph query strings to execute in parallel (e.g. ['act_12345?fields=id,name,account_status,spend_cap']).",
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
    title: "Fetch Meta ad accounts",
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "fetch",
    title: "Meta ad accounts retrieved",
    content: result.content,
  }),
  async execute(args, exec) {
    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error(
        "User authentication context required to fetch Meta ad accounts.",
      );
    }

    const queries =
      args.queries && args.queries.length > 0
        ? args.queries
        : [
            "me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name,amount_spent,spend_cap&limit=25",
          ];

    const res = await executeMetaGraphQuery({
      params: { queries },
      context: {
        userId,
        providerSlug: "meta",
      },
    });

    if (!res.success || !res.data) {
      throw new Error(
        res.error?.message || "Failed to fetch Meta ad accounts from Graph API.",
      );
    }

    return {
      data: res.data as unknown as Record<string, any>,
      summary: JSON.stringify(res.data, null, 2),
    };
  },
});
