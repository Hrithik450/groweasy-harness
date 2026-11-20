import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { executeMetaGraphQuery } from "@/lib/connectors/meta.ads";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

/** Queries accepted in one call; the connector runs them in parallel. */
const MAX_QUERIES = 5;

export const queryMetaToolDefinition = {
  type: "function" as const,
  name: "queryMeta",
  description:
    "Runs free-form Meta Graph API queries (v22.0) against any endpoint the connected account can read: campaigns, ad sets, ads, creatives, insights, custom audiences.\n\n" +
    "Write each query as a relative path plus parameters, e.g.\n" +
    "- `act_123/insights?level=campaign&fields=campaign_name,spend,purchases,actions&date_preset=last_7d`\n" +
    "- `campaign_123/ads?fields=id,name,status,creative{id,name,image_url,video_id}&limit=50`\n" +
    "- `act_123?fields=name,currency,amount_spent,balance`\n\n" +
    'Useful parameters: `fields`, `filtering` (JSON array with operators IN/NOT_IN/GREATER_THAN/LESS_THAN), `date_preset` (today, yesterday, last_7d, last_30d, maximum), `time_range` (`{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}`), `time_increment`, `breakdowns` (age, gender, region, placement), `level`, `limit`. The access token is injected on the backend.',
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description: `1 to ${MAX_QUERIES} free-form Graph queries, executed in parallel.`,
      },
    },
    required: ["queries"],
  },
};

export interface QueryMetaArgs {
  queries?: string[];
}

export async function executeQueryMetaTool(
  input: ToolInput<QueryMetaArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    const errorMsg = "User authentication context required to query Meta.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const queries = (input.args?.queries ?? [])
    .map((query) => query.trim())
    .filter(Boolean)
    .slice(0, MAX_QUERIES);

  if (queries.length === 0) {
    const errorMsg = "The 'queries' array parameter is required to query Meta.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const res = await executeMetaGraphQuery({
    params: { queries },
    context: { userId, providerSlug: "metaAds" },
  });

  if (!res.success || !res.data) {
    const errorMsg = res.error?.message || "Meta Graph query failed.";
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
        { type: "input_text", text: JSON.stringify(res.data, null, 2) },
      ],
    },
  };
}
