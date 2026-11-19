import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { executeMetaGraphQuery } from "@/lib/connectors/meta.ads";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const fetchMetaAdSetsToolDefinition = {
  type: "function" as const,
  name: "fetchMetaAdSets",
  description:
    "Fetch advertising Ad Sets from Meta Ads Manager using free-form Meta Graph API queries (v22.0).\n\n" +
    "Target Endpoint: `GET /v22.0/{ad_account_id}/adsets`, `GET /v22.0/{campaign_id}/adsets`, or `GET /v22.0/{ad_set_id}`\n\n" +
    "Supported Query Parameters:\n" +
    "- `fields`: Comma-separated fields (e.g. `id,name,status,effective_status,campaign_id,campaign{id,name},daily_budget,lifetime_budget,bid_amount,billing_event,optimization_goal,targeting,created_time,updated_time,start_time,end_time,learning_stage_info,issues_info`)\n" +
    '- `filtering`: JSON array of filter objects (e.g. `[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]`)\n' +
    "- `date_preset`: `today`, `yesterday`, `this_month`, `last_7d`, `last_30d`, `maximum`\n" +
    '- `time_range`: `{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}`\n' +
    "- `limit`: Max records to return (e.g. `limit=25`)\n\n" +
    "Supports plural queries (max 5 parallel queries at a time) inside `queries` array. Provide full relative path and parameters except accessToken, which is securely injected on the backend.",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional Array of 1 to 5 free-form Meta Graph query strings to execute as per your custom requirements in parallel (e.g. ['act_123456789/adsets?fields=id,name,status,effective_status,targeting,optimization_goal&limit=25', 'campaign_987654321/adsets?fields=id,name,status,daily_budget&limit=10']).",
      },
    },
    required: ["queries"],
  },
};

export interface FetchMetaAdSetsArgs {
  queries?: string[];
}

export async function executeFetchMetaAdSetsTool(
  input: ToolInput<FetchMetaAdSetsArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    const errorMsg =
      "User authentication context required to fetch Meta ad sets.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const queries: string[] = [];
  if (input.args?.queries && input.args.queries.length > 0) {
    queries.push(...input.args.queries);
  }

  if (queries.length === 0) {
    const errorMsg =
      "The 'queries' array parameter is required to fetch ad sets.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const res = await executeMetaGraphQuery({
    params: {
      queries,
    },
    context: {
      userId,
      providerSlug: "metaAds",
    },
  });

  if (!res.success || !res.data) {
    const errorMsg =
      res.error?.message || "Failed to fetch ad sets from Meta Graph API.";
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
          text: JSON.stringify(res.data, null, 2),
        },
      ],
    },
  };
}
