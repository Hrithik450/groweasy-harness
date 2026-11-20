import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { executeMetaGraphQuery } from "@/lib/connectors/meta.ads";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const fetchMetaAdAccountsToolDefinition = {
  type: "function" as const,
  name: "fetchMetaAdAccounts",
  description:
    "Fetch Meta Ad Accounts accessible by the authenticated user using free-form Meta Graph API queries (v22.0).\n\n" +
    "Target Endpoint: `GET /v22.0/me/adaccounts` or `GET /v22.0/{ad_account_id}`\n\n" +
    "Supported Query Parameters:\n" +
    "- `fields`: Comma-separated fields (e.g. `id,account_id,name,account_status,currency,timezone_name,amount_spent,spend_cap,balance,business,capabilities,created_time,disable_reason,min_daily_budget`)\n" +
    '- `filtering`: JSON array of filter objects (e.g. `[{"field":"account_status","operator":"IN","value":[1]}]` where 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW)\n' +
    "- `limit`: Max records to return (e.g. `limit=25`)\n" +
    "- `sort`: Sort criteria (e.g. `['name_ascending']`).\n\n" +
    "Full field reference: https://developers.facebook.com/docs/marketing-api/reference/ad-account/.",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional Array of 1 to 5 free-form Meta Graph query strings to execute as per your custom requirements in parallel (e.g. ['act_12345?fields=id,name,account_status,spend_cap', 'act_67890?fields=id,name,account_status,spend_cap']).",
      },
    },
  },
};

export interface FetchMetaAdAccountsArgs {
  queries?: string[];
}

export async function executeFetchMetaAdAccountsTool(
  input: ToolInput<FetchMetaAdAccountsArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    const errorMsg =
      "User authentication context required to fetch Meta ad accounts.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const queries =
    input.args?.queries && input.args.queries.length > 0
      ? input.args.queries
      : [
          "me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name,amount_spent,spend_cap&limit=25",
        ];

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
      res.error?.message || "Failed to fetch Meta ad accounts from Graph API.";
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
