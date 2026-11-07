import type { Session } from "@openai-harness/session";
import { createMetaAdSet, createMetaCampaign } from "@openai-harness/connector-meta";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface SingleCampaignConfig {
  name: string;
  objective:
    | "OUTCOME_SALES"
    | "OUTCOME_TRAFFIC"
    | "OUTCOME_LEADS"
    | "OUTCOME_AWARENESS"
    | "OUTCOME_ENGAGEMENT";
  status?: "PAUSED" | "ACTIVE";
  dailyBudget?: number;
  specialAdCategories?: string[];
  adAccountId: string;
  adSet?: {
    name?: string;
    dailyBudget?: number;
    optimizationGoal?: string;
    billingEvent?: string;
    bidAmount?: number;
    targeting?: {
      geoLocations?: {
        countries?: string[];
        regions?: Array<{ key: string }>;
        cities?: Array<{
          key: string;
          radius?: number;
          distanceUnit?: string;
        }>;
      };
      ageMin?: number;
      ageMax?: number;
      genders?: number[];
      interests?: Array<{ id: string; name: string }> | string[];
    };
  };
  creative?: {
    name?: string;
    headline?: string;
    primaryText?: string;
    description?: string;
    callToAction?: string;
    destinationUrl?: string;
    mediaUrl?: string;
    pageId?: string;
  };
}

export interface CreateMetaCampaignsArgs extends Partial<SingleCampaignConfig> {
  campaigns?: SingleCampaignConfig[];
}

export const createMetaCampaignsTool = defineTool({
  name: "createMetaCampaigns",
  description:
    "Prerequisite: campaign-builder skill is a prerequisite.\n\n" +
    "Create one or multiple Meta advertising campaigns, ad sets, and creatives in Meta Ads Manager. Defaults status to 'PAUSED' for safe advertiser review before publishing.",
  timeoutMs: 60000,
  isConcurrencySafe: () => false,
  parameters: {
    campaigns: {
      type: "array",
      description:
        "Array of 1 to 5 campaigns to create in parallel with optional full ad sets and creatives.",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          name: { type: "string", required: true },
          objective: {
            type: "string",
            required: true,
            enum: [
              "OUTCOME_SALES",
              "OUTCOME_TRAFFIC",
              "OUTCOME_LEADS",
              "OUTCOME_AWARENESS",
              "OUTCOME_ENGAGEMENT",
            ],
          },
          status: { type: "string", enum: ["PAUSED", "ACTIVE"] },
          dailyBudget: { type: "number" },
          adAccountId: { type: "string", required: true },
        },
      },
    },
    name: {
      type: "string",
      description: "Campaign name when creating a single campaign directly.",
    },
    objective: {
      type: "string",
      enum: [
        "OUTCOME_SALES",
        "OUTCOME_TRAFFIC",
        "OUTCOME_LEADS",
        "OUTCOME_AWARENESS",
        "OUTCOME_ENGAGEMENT",
      ],
      description: "Campaign objective.",
    },
    adAccountId: {
      type: "string",
      description: "Target Meta Ad Account ID (e.g. 'act_123456789').",
    },
    dailyBudget: {
      type: "number",
      description:
        "Daily budget in account currency major units (e.g. 500 for ₹500 or $500).",
    },
    status: {
      type: "string",
      enum: ["PAUSED", "ACTIVE"],
      description: "Status: 'PAUSED' (default) or 'ACTIVE'.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: true,
      properties: {
        summary: { type: "string", required: true },
        results: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              success: { type: "boolean", required: true },
              name: { type: "string", required: true },
              adAccountId: { type: "string", required: true },
            },
          },
        },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: (value as any).summary,
      },
    ],
    presentationMeta: (_args, value) => value,
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "execute",
    title: `Create Meta campaigns (${args.campaigns?.length || (args.name ? 1 : 0)})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: "Meta campaigns created",
    content: result.content,
  }),
  async execute(args, exec) {
    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error(
        "User authentication context required to create campaigns.",
      );
    }

    const campaignConfigs: SingleCampaignConfig[] = [];
    if (
      args.campaigns &&
      Array.isArray(args.campaigns) &&
      args.campaigns.length > 0
    ) {
      campaignConfigs.push(
        ...(args.campaigns.slice(0, 5) as SingleCampaignConfig[]),
      );
    } else if (args.name && args.objective && args.adAccountId) {
      campaignConfigs.push({
        name: args.name,
        objective: args.objective as any,
        status: (args.status as any) || "PAUSED",
        dailyBudget: args.dailyBudget,
        adAccountId: args.adAccountId,
      });
    }

    if (campaignConfigs.length === 0) {
      throw new Error(
        "Campaign details (name, objective, adAccountId) or a campaigns array are required.",
      );
    }

    const results: Array<{
      success: boolean;
      name: string;
      campaignId?: string;
      status?: string;
      adAccountId: string;
      error?: string;
    }> = [];

    for (const cfg of campaignConfigs) {
      try {
        const res = await createMetaCampaign({
          params: {
            name: cfg.name,
            objective: cfg.objective,
            status: cfg.status || "PAUSED",
            dailyBudget: cfg.dailyBudget,
            specialAdCategories: cfg.specialAdCategories || [],
            adAccountId: cfg.adAccountId,
          },
          context: {
            userId,
            providerSlug: "meta",
          },
        });

        if (!res.success || !res.data) {
          results.push({
            success: false,
            name: cfg.name,
            adAccountId: cfg.adAccountId,
            error: res.error?.message || "Failed to create campaign",
          });
          continue;
        }

        const campaignId = res.data.id;

        if (cfg.adSet && campaignId) {
          await createMetaAdSet({
            params: {
              name: cfg.adSet.name || `${cfg.name} - Ad Set`,
              campaignId,
              adAccountId: cfg.adAccountId,
              status: cfg.status || "PAUSED",
              dailyBudget: cfg.adSet.dailyBudget,
              optimizationGoal: cfg.adSet.optimizationGoal,
              billingEvent: cfg.adSet.billingEvent,
              bidAmount: cfg.adSet.bidAmount,
              targeting: cfg.adSet.targeting as any,
            },
            context: {
              userId,
              providerSlug: "meta",
            },
          });
        }

        results.push({
          success: true,
          name: cfg.name,
          campaignId,
          status: cfg.status || "PAUSED",
          adAccountId: cfg.adAccountId,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          success: false,
          name: cfg.name,
          adAccountId: cfg.adAccountId,
          error: msg,
        });
      }
    }

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    const lines: string[] = [
      `### Created Meta Campaigns: ${successful.length} succeeded, ${failed.length} failed\n`,
    ];

    for (const r of successful) {
      lines.push(
        `- **${r.name}** (\`${r.campaignId}\`): Status: ${r.status} | Account: \`${r.adAccountId}\``,
      );
    }
    for (const f of failed) {
      lines.push(`- **${f.name}** (Failed): ${f.error}`);
    }

    return {
      results,
      summary: lines.join("\n"),
    };
  },
});

export const createMetaCampaignTool = createMetaCampaignsTool;
