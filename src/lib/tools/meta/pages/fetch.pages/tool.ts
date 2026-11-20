import { executeMetaGraphQuery } from "@/lib/connectors/meta.ads";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export interface FetchMetaPagesArgs {
  queries?: string[];
}

export const fetchMetaPagesToolDefinition = {
  type: "function" as const,
  name: "fetchMetaPages",
  description:
    "Fetch Facebook Pages with free-form Graph queries (v22.0). Ads publish under a Page, so use a returned id as `pageId` in `createMetaCreative`.\n\n" +
    "Target endpoints: `GET /me/accounts` or `GET /{page_id}`.\n\n" +
    "Fields include `id,name,category,link,fan_count,verification_status,instagram_business_account,tasks`. Query parameters: `fields`, `limit`, `after`.\n\n" +
    "Up to 5 queries run in parallel; the access token is injected on the backend.\n\n" +
    "Full field reference: https://developers.facebook.com/docs/graph-api/reference/page/.",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description:
          "1 to 5 free-form Graph queries, e.g. ['me/accounts?fields=id,name,category,link&limit=25', '1029384756?fields=id,name,fan_count'].",
      },
    },
    required: ["queries"],
  },
};

export async function executeFetchMetaPagesTool(
  input: ToolInput<FetchMetaPagesArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) return failure("User authentication context required.");
  if (!input.args?.queries?.length) {
    return failure("The 'queries' array parameter is required.");
  }

  const res = await executeMetaGraphQuery({
    params: { queries: input.args.queries },
    context: { userId, providerSlug: "metaAds" },
  });

  if (!res.success || !res.data) {
    return failure(res.error?.message || "Failed to fetch Pages from Meta.");
  }

  return {
    success: true,
    data: {
      contentParts: [{ type: "input_text", text: JSON.stringify(res.data) }],
    },
  };
}
