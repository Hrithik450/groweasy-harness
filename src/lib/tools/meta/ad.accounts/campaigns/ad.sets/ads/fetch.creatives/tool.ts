import { toolFailure as failure } from "@/lib/tools/utils";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { executeMetaGraphQuery } from "@/lib/connectors/meta.ads";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const fetchMetaCreativesToolDefinition = {
  type: "function" as const,
  name: "fetchMetaCreatives",
  description:
    "Fetch AdCreatives from Meta with free-form Graph queries (v22.0).\n\n" +
    "Target endpoints: `GET /{ad_account_id}/adcreatives` or `GET /{creative_id}`.\n\n" +
    "Fields include `id,name,status,image_hash,video_id,image_url,thumbnail_url,object_story_spec,asset_feed_spec`. Use a returned creative id as `creativeId` in `upsertMetaAd`.\n\n" +
    "Query parameters: `fields`, `filtering`, `limit`, `after` (paging cursor). Up to 5 queries run in parallel; the access token is injected on the backend.\n\n" +
    "Full field reference: https://developers.facebook.com/docs/marketing-api/reference/ad-creative/.",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description:
          "1 to 5 free-form Graph queries, e.g. ['act_123/adcreatives?fields=id,name,image_hash,video_id,object_story_spec&limit=25', '9876543210?fields=id,name,image_hash,video_id,object_story_spec'].",
      },
    },
    required: ["queries"],
  },
};

export interface FetchMetaCreativesArgs {
  queries?: string[];
}

export async function executeFetchMetaCreativesTool(
  input: ToolInput<FetchMetaCreativesArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) return failure("User authentication context required.");
  if (!input.args?.queries?.length) {
    return failure("The 'queries' array parameter is required.");
  }

  const res = await executeMetaGraphQuery({
    params: { queries: input.args.queries },
    context: { userId, providerSlug: "meta" },
  });

  if (!res.success || !res.data) {
    return failure(
      res.error?.message || "Failed to fetch creatives from Meta.",
    );
  }

  return {
    success: true,
    data: {
      contentParts: [{ type: "input_text", text: JSON.stringify(res.data) }],
    },
  };
}
