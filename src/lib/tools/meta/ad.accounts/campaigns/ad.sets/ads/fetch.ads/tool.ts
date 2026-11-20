import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { executeMetaGraphQuery } from "@/lib/connectors/meta.ads";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const fetchMetaAdsToolDefinition = {
  type: "function" as const,
  name: "fetchMetaAds",
  description:
    "Fetch advertising ads from Meta Ads Manager using free-form Meta Graph API queries (v22.0).\n\n" +
    "Target Endpoint: `GET /v22.0/{ad_account_id}/ads`, `GET /v22.0/{ad_set_id}/ads`, `GET /v22.0/{campaign_id}/ads`, or `GET /v22.0/{ad_id}`\n\n" +
    "Supported Query Parameters:\n" +
    "- `fields`: Comma-separated fields (e.g. `id,name,status,effective_status,adset_id,campaign_id,creative{id,name,title,body,image_hash,image_url,thumbnail_url,video_id,object_story_spec,asset_feed_spec,call_to_action_type},ad_review_feedback,recommendations,issues_info,created_time,updated_time`)\n" +
    "  - `creative.image_hash` / `creative.video_id` are the reusable asset ids; `object_story_spec` carries the page and media.\n" +
    '- `filtering`: JSON array of filter objects (e.g. `[{"field":"effective_status","operator":"IN","value":["ACTIVE","DISAPPROVED","WITH_ISSUES"]}]`)\n' +
    "- `date_preset`: `today`, `yesterday`, `this_month`, `last_7d`, `last_30d`, `maximum`\n" +
    '- `time_range`: `{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}`\n' +
    "- `limit`: Max records to return (e.g. `limit=25`)\n\n" +
    "Full field reference: https://developers.facebook.com/docs/marketing-api/reference/adgroup/.",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional Array of 1 to 5 free-form Meta Graph query strings to execute as per your custom requirements in parallel (e.g. ['act_123456789/ads?fields=id,name,status,effective_status,creative{id,name,image_hash,video_id,object_story_spec}&limit=25', 'adset_987654321/ads?fields=id,name,status,effective_status&limit=10']).",
      },
    },
    required: ["queries"],
  },
};

export interface FetchMetaAdsArgs {
  queries?: string[];
}

export async function executeFetchMetaAdsTool(
  input: ToolInput<FetchMetaAdsArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    const errorMsg = "User authentication context required to fetch Meta ads.";
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
    const errorMsg = "The 'queries' array parameter is required to fetch ads.";
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
      res.error?.message || "Failed to fetch ads from Meta Graph API.";
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
