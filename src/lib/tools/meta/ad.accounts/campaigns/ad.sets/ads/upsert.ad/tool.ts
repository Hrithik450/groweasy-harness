import {
  createMetaAd,
  updateMetaAd,
  MetaAdStatus,
  type MetaAdParams,
} from "@/lib/connectors/meta.ads";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const upsertMetaAdToolDefinition = {
  type: "function" as const,
  name: "upsertMetaAd",
  description:
    "Create one Meta ad from an existing creative, or pause/activate one with `id` + `status`. Creative content is immutable — build it with `createMetaCreative` first.",
  parameters: {
    type: "object",
    properties: {
      ad: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "Meta ad id; present means update its status. omit for new creation.",
          },
          adAccountId: {
            type: "string",
            description:
              'Meta ad account id. Get it from `fetchMetaAdAccounts`. (e.g.: "act_123456789"). Required when creating.',
          },
          adSetId: {
            type: "string",
            description:
              'Parent ad set id. Get it from `fetchMetaAdSets`. (e.g.: "120247785000000001"). Required when creating.',
          },
          creativeId: {
            type: "string",
            description:
              'Ad creative id. Get it from `createMetaCreative` (or `fetchMetaCreatives`). (e.g.: "9876543210"). Required when creating.',
          },
          name: {
            type: "string",
            description:
              'Ad name, 3-8 words; create only. (e.g.: "Diwali — Static Winner").',
          },
          status: {
            type: "string",
            enum: [MetaAdStatus.PAUSED, MetaAdStatus.ACTIVE],
            description:
              "Required when updating by id; creation defaults to PAUSED.",
          },
        },
        additionalProperties: false,
      },
    },
    required: ["ad"],
  },
};

export type AdConfig = Omit<
  MetaAdParams,
  "adAccountId" | "adSetId" | "name" | "creativeId"
> & {
  id?: string;
  adAccountId?: string;
  adSetId?: string;
  name?: string;
  creativeId?: string;
};

export interface UpsertMetaAdArgs {
  ad?: AdConfig;
}

export async function executeUpsertMetaAdTool(
  input: ToolInput<UpsertMetaAdArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) return failure("User authentication context required.");

  const cfg = input.args?.ad;
  if (!cfg) return failure("The 'ad' object is required.");

  try {
    if (cfg.id) {
      if (!cfg.status) {
        return failure(
          "Updating an ad only supports status (ACTIVE or PAUSED). Meta does not allow changing a creative's content — to change media, copy, page, or CTA, create a new ad with a new creative instead.",
        );
      }

      const res = await updateMetaAd({
        params: { adId: cfg.id, status: cfg.status },
        context: { userId, providerSlug: "metaAds" },
      });

      if (!res.success) {
        return failure(res.error?.message || "Failed to update ad.");
      }

      return {
        success: true,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `Ad **${cfg.name || res.data?.name || cfg.id}** (\`${cfg.id}\`) saved. | Status: ${cfg.status}`,
            },
          ],
        },
      };
    }

    if (!cfg.adAccountId || !cfg.adSetId || !cfg.name || !cfg.creativeId) {
      return failure(
        "Create needs adAccountId, adSetId, name, and creativeId.",
      );
    }

    const res = await createMetaAd({
      params: {
        adAccountId: cfg.adAccountId,
        adSetId: cfg.adSetId,
        name: cfg.name,
        status: cfg.status || "PAUSED",
        creativeId: cfg.creativeId,
      },
      context: { userId, providerSlug: "metaAds" },
    });

    if (!res.success || !res.data) {
      return failure(res.error?.message || "Failed to create ad.");
    }

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Ad **${cfg.name}** (\`${res.data.id}\`) saved in ad set \`${cfg.adSetId}\` | Creative: \`${res.data.creativeId}\` | Status: ${res.data.status}`,
          },
        ],
      },
    };
  } catch (err: unknown) {
    return failure(err instanceof Error ? err.message : "Ad upsert failed.");
  }
}
