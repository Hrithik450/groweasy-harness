import type { Session } from "@openai-harness/session";
import { executeMetaGraphQuery } from "@openai-harness/connector-meta";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface QueryMetaGraphAPIArgs {
  queries?: string[];
}

export const queryMetaGraphAPITool = defineTool({
  name: "queryMetaGraphAPI",
  description:
    "Prerequisite: the `alerts` and `suggestions` skills use this tool for account diagnostics.\n\n" +
    "Executes raw Meta Graph API query strings (v22.0) across Meta Ads accounts to diagnose delivery blockers, account health, policy disapprovals, ad set learning limitations, billing issues, and performance bottlenecks.",
  timeoutMs: 30000,
  isConcurrencySafe: () => true,
  parameters: {
    queries: {
      type: "array",
      required: true,
      items: { type: "string" },
      description:
        "Array of 1 to 5 Meta Graph API query endpoint paths and parameters to execute in parallel (e.g. ['act_123?fields=id,account_status,spend_cap']).",
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
    kind: "execute",
    title: `Query Meta Graph API (${args.queries?.length ?? 0} queries)`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: "Meta Graph API query completed",
    content: result.content,
  }),
  async execute(args, exec) {
    const queries = (args.queries || []).filter(
      (q) => typeof q === "string" && q.trim().length > 0,
    );

    if (queries.length === 0) {
      throw new Error(
        "The 'queries' array parameter is required to inspect Meta Graph API diagnostics.",
      );
    }

    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error("User authentication context required to query Meta Graph API.");
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
        res.error?.message || "Failed to execute queries against Meta Graph API.",
      );
    }

    return {
      data: res.data as unknown as Record<string, any>,
      summary: JSON.stringify(res.data, null, 2),
    };
  },
});
