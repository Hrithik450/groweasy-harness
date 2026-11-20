import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { executeMetaGraphQuery } from "@/lib/connectors/meta.ads";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const fetchMetaCampaignsToolDefinition = {
  type: "function" as const,
  name: "fetchMetaCampaigns",
  description:
    "Fetch advertising campaigns from Meta Ads Manager using free-form Meta Graph API queries (v22.0).\n\n" +
    "Target Endpoint: `GET /v22.0/{ad_account_id}/campaigns` or `GET /v22.0/{campaign_id}`\n\n" +
    "Supported Query Parameters:\n" +
    "- `fields`: Comma-separated fields (e.g. `id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,buying_type,bid_strategy,created_time,updated_time,start_time,stop_time,issues_info,recommendations`)\n" +
    "- `filtering`: JSON array of filter objects with operators like 'IN', 'NOT_IN', 'GREATER_THAN', 'LESS_THAN'. Examples:\n" +
    '  - Active/Paused only: `[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]`\n' +
    '  - Campaigns created in the last 24h: `[{"field":"created_time","operator":"GREATER_THAN","value":"<unix_timestamp_24h_ago>"}]`\n' +
    "- `date_preset`: `today`, `yesterday`, `this_month`, `last_7d`, `last_30d`, `maximum`\n" +
    '- `time_range`: `{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}`\n' +
    "- `limit`: Max records to return (e.g. `limit=25`)\n\n" +
    "Full field reference: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/.",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional Array of 1 to 5 free-form Meta Graph query strings to execute as per your custom requirements in parallel (e.g. ['act_123456789/campaigns?fields=id,name,status,effective_status,objective,daily_budget,created_time&limit=25', 'act_987654321/campaigns?fields=id,name,status,effective_status&limit=10']).",
      },
    },
    required: ["queries"],
  },
};

export interface FetchMetaCampaignsArgs {
  queries?: string[];
}

export async function executeFetchMetaCampaignsTool(
  input: ToolInput<FetchMetaCampaignsArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    const errorMsg = "User authentication context required to fetch campaigns.";
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
      "The 'queries' array parameter is required to fetch campaigns.";
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
      res.error?.message || "Failed to fetch campaigns from Meta Graph API.";
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
