import {
  createMetaCampaign,
  updateMetaCampaign,
  MetaCampaignObjective,
  MetaCampaignStatus,
  type MetaCampaignParams,
} from "@/lib/connectors/meta.ads";
import {
  upsertDetailBarItems,
  resolveDetailBarSession,
} from "@/lib/detail.bar/service";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const upsertMetaCampaignToolDefinition = {
  type: "function" as const,
  name: "upsertMetaCampaign",
  description:
    "Create or update one Meta campaign. Include `id` to update it (name, status, budgets); omit `id` to create. Creation defaults to 'PAUSED' for review.",
  parameters: {
    type: "object",
    properties: {
      campaign: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Meta campaign id; present means update else create.",
          },
          name: {
            type: "string",
            description:
              'Meta campaign name, 3-8 words. (e.g.: "Diwali Sale — Broad").',
          },
          adAccountId: {
            type: "string",
            description:
              'Meta ad account id. Get it from `fetchMetaAdAccounts`. (e.g.: "act_123456789"). Required when creating.',
          },
          objective: {
            type: "string",
            enum: Object.values(MetaCampaignObjective),
            description: "Required when creating; ignored on update.",
          },
          status: {
            type: "string",
            enum: [MetaCampaignStatus.PAUSED, MetaCampaignStatus.ACTIVE],
          },
          dailyBudget: {
            type: "number",
            description:
              "Daily budget in account currency major units. (e.g.: 500 for ₹500).",
          },
          lifetimeBudget: {
            type: "number",
            description:
              "Lifetime budget in major units; use for fixed-date campaigns instead of daily. (e.g.: 15000).",
          },
          startTime: {
            type: "string",
            description:
              'Campaign start, ISO-8601. (e.g.: "2026-12-01T00:00:00+0530").',
          },
          stopTime: {
            type: "string",
            description:
              'Campaign end, ISO-8601. (e.g.: "2026-12-31T23:59:59+0530").',
          },
          specialAdCategories: {
            type: "array",
            description:
              'Only when Meta requires a category. Docs: https://developers.facebook.com/docs/marketing-api/audiences/reference/special-ad-category/. (e.g.: ["HOUSING"]).',
            items: {
              type: "string",
              enum: [
                "NONE",
                "EMPLOYMENT",
                "HOUSING",
                "CREDIT",
                "ISSUES_ELECTIONS_POLITICS",
              ],
            },
          },
        },
        additionalProperties: false,
      },
    },
    required: ["campaign"],
  },
};

export type CampaignConfig = Omit<
  MetaCampaignParams,
  "adSets" | "creative" | "userId" | "adAccountId"
> & {
  id?: string;
  adAccountId?: string;
  lifetimeBudget?: number | string;
};

export interface UpsertMetaCampaignArgs {
  campaign?: CampaignConfig;
}

export async function executeUpsertMetaCampaignTool(
  input: ToolInput<UpsertMetaCampaignArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) return failure("User authentication context required.");

  const cfg = input.args?.campaign;
  if (!cfg) return failure("The 'campaign' object is required.");

  const name = cfg.name?.trim() || cfg.id || "";

  try {
    if (cfg.id) {
      const res = await updateMetaCampaign({
        params: {
          campaignId: cfg.id,
          ...(cfg.name ? { name: cfg.name } : {}),
          ...(cfg.status ? { status: cfg.status } : {}),
          ...(cfg.dailyBudget !== undefined
            ? { dailyBudget: cfg.dailyBudget }
            : {}),
          ...(cfg.lifetimeBudget !== undefined
            ? { lifetimeBudget: cfg.lifetimeBudget }
            : {}),
        },
        context: { userId, providerSlug: "meta" },
      });

      if (!res.success) {
        return failure(res.error?.message || "Failed to update campaign.");
      }

      const session = resolveDetailBarSession(userId, "campaigns");
      if (session) {
        upsertDetailBarItems(session, "campaigns", [
          {
            id: cfg.id,
            data: {
              id: cfg.id,
              ...(cfg.name ? { name: cfg.name } : {}),
              ...(cfg.status ? { metaStatus: cfg.status } : {}),
            },
          },
        ]);
      }

      return {
        success: true,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `Campaign **${cfg.name || res.data?.name || cfg.id}** (\`${cfg.id}\`) saved.${cfg.status ? ` | Status: ${cfg.status}` : ""}`,
            },
          ],
        },
      };
    }

    if (!cfg.name || !cfg.objective || !cfg.adAccountId || !cfg.status) {
      return failure("Create needs name, objective, adAccountId, and status.");
    }

    const hasDaily = cfg.dailyBudget !== undefined;
    if (hasDaily === (cfg.lifetimeBudget !== undefined)) {
      return failure(
        "Create needs exactly one of dailyBudget or lifetimeBudget.",
      );
    }

    const res = await createMetaCampaign({
      params: {
        name: cfg.name,
        objective: cfg.objective,
        status: cfg.status,
        ...(hasDaily
          ? { dailyBudget: Number(cfg.dailyBudget) }
          : { lifetimeBudget: Number(cfg.lifetimeBudget) }),
        specialAdCategories: cfg.specialAdCategories || [],
        startTime: cfg.startTime,
        stopTime: cfg.stopTime,
        adAccountId: cfg.adAccountId,
      },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success || !res.data) {
      return failure(res.error?.message || "Failed to create campaign.");
    }

    const campaignId = res.data.id;
    if (!campaignId) {
      return failure("Meta returned no campaign id.");
    }

    const session = resolveDetailBarSession(userId, "campaigns");
    if (session) {
      upsertDetailBarItems(session, "campaigns", [
        {
          id: campaignId,
          data: {
            id: campaignId,
            name: cfg.name,
            metaStatus: cfg.status,
          },
        },
      ]);
    }

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Campaign **${cfg.name}** (\`${res.data.id}\`) saved. | Status: ${cfg.status} | Account: \`${cfg.adAccountId}\``,
          },
        ],
      },
    };
  } catch (err: unknown) {
    return failure(
      err instanceof Error ? err.message : "Campaign upsert failed.",
    );
  }
}
