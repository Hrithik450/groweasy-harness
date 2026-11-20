import {
  getDetailBarItemById,
  readAllRootRows,
  readChildRows,
  resolveDetailBarSession,
  upsertDetailBarItems,
  type BarItemInput,
} from "@/lib/detail.bar/service";
import { tabChildFields } from "@/lib/detail.bar/fields";
import {
  AD_CATEGORIES,
  type AdCategory,
  type CampaignAd,
  type CampaignAdAction,
} from "@/lib/detail.bar/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

const MAX_ADS_PER_CALL = 20;

export const upsertAdsClassifiedToolDefinition = {
  type: "function" as const,
  name: "upsertAdsClassified",
  preSkills: "ads-classifier",
  description:
    "Saves one verdict per ad (winner, scaler, potential, loser, untested) together with everything the card renders: name, ad set, format, media, metrics computed from the Meta read, comparison lines, and the recommended action.",
  parameters: {
    type: "object",
    properties: {
      ads: {
        type: "array",
        maxItems: MAX_ADS_PER_CALL,
        description: "One verdict and its ad data, keyed by the Meta ad id.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Meta ad id, exactly as fetchMetaAds returned it.",
            },
            category: {
              type: "string",
              enum: [...AD_CATEGORIES],
            },
            campaignId: {
              type: "string",
              description:
                "Campaign id. Required when the ad is not saved yet.",
            },
            name: {
              type: "string",
              description: "Meta ad name, exactly as fetchMetaAds returned it.",
            },
            adsetId: {
              type: "string",
              description: "Meta ad set id; returned by Meta.",
            },
            format: {
              type: "string",
              enum: ["video", "image"],
            },
            mediaUrl: {
              type: "string",
              description:
                "Creative URL of the creative for the preview returned by Meta.",
            },
            metrics: {
              type: "object",
              description:
                "Per-ad numbers computed from the Meta read. Every value is printed as-is.",
              properties: {
                daysActive: { type: "integer" },
                impressions: { type: "integer" },
                clicks: { type: "integer" },
                ctr: { type: "string" },
                spend: { type: "string" },
                purchases: { type: "integer" },
                frequency: { type: "number" },
                cpa: { type: "string" },
                roas: { type: "string" },
              },
              additionalProperties: false,
            },
            siblingComparison: {
              type: "string",
              description:
                'One line comparing this ad with the other ads in its ad set (then campaign, then account), max 5-6 words. (e.g.: "CPA 40% below set average" or "Lowest cost per result in set").',
            },
            resultShare: {
              type: "string",
              description:
                'This ad\'s share of the results delivered by its ad set or campaign or ad-account, 5-6 words. (e.g.: "38% of ad set 1 results").',
            },
            value: {
              type: "string",
              description:
                'Expected gain from taking the action, one metric. (e.g.: "Chances +18% ROAS in 7 days").',
            },
            whyItWorks: {
              type: "string",
              description:
                'One crisp line on why it works, max 10 words. (e.g.: "Strong hook, cheap results, room to scale").',
            },
            action: {
              type: "object",
              description: "The one move the card recommends.",
              properties: {
                fix: {
                  type: "string",
                  description:
                    'The move in one sentence. (e.g.: "Pause it and move ₹400/day to the winner").',
                },
                before: {
                  type: "string",
                  description:
                    'What is true now. (e.g.: "CPA ₹210 — 2× the set average").',
                },
                after: {
                  type: "string",
                  description:
                    'What the move changes. (e.g.: "Budget moved; winner now at CPA ₹132").',
                },
              },
              required: ["fix"],
              additionalProperties: false,
            },
          },
          required: [
            "id",
            "category",
            "campaignId",
            "name",
            "adsetId",
            "format",
            "mediaUrl",
            "metrics",
            "action",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["ads"],
  },
};

/** The whole card, with the verdict and its parent added. */
type UpsertAdsClassifiedArgs = {
  ads?: Array<
    Required<Omit<CampaignAd, "action">> & {
      campaignId: string;
      action: CampaignAdAction;
    }
  >;
};

export async function executeUpsertAdsClassifiedTool(
  input: ToolInput<UpsertAdsClassifiedArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    return failure("User authentication context is required to classify ads.");
  }

  const raw = input.args?.ads;
  if (!Array.isArray(raw) || raw.length === 0) {
    return failure("The 'ads' array parameter is required.");
  }

  const session = resolveDetailBarSession(userId, "campaigns");
  if (!session) {
    return failure("Ad Manager session not found for this user.");
  }
  const adsField = tabChildFields("campaigns")[0];
  if (!adsField) {
    return failure("The campaign ads level is not configured.");
  }
  const campaignIds = new Set(
    readAllRootRows(session.id, "campaigns").map((row) => row.id),
  );

  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

  const items: BarItemInput[] = [];
  for (const ad of raw.slice(0, MAX_ADS_PER_CALL)) {
    const id = typeof ad?.id === "string" ? ad.id.trim() : "";
    const category =
      typeof ad?.category === "string" ? ad.category.trim().toLowerCase() : "";
    const campaignId = text(ad?.campaignId);
    if (!id) return failure("Every ad needs a non-empty 'id'.");
    if (!AD_CATEGORIES.includes(category as AdCategory)) {
      return failure(
        `Unknown category "${category}"; use ${AD_CATEGORIES.join(", ")}.`,
      );
    }
    if (!campaignId || !campaignIds.has(campaignId)) continue;

    const action = text(ad?.action?.fix)
      ? {
          fix: text(ad.action?.fix)!,
          ...(text(ad.action?.before)
            ? { before: text(ad.action?.before)! }
            : {}),
          ...(text(ad.action?.after) ? { after: text(ad.action?.after)! } : {}),
        }
      : undefined;
    if (!action) return failure("Every ad needs an action.fix.");

    const metrics =
      ad?.metrics &&
      typeof ad.metrics === "object" &&
      !Array.isArray(ad.metrics)
        ? ad.metrics
        : undefined;

    items.push({
      id,
      parentId: campaignId,
      data: {
        name: text(ad?.name) ?? "Ad",
        category,
        ...(text(ad?.adsetId) ? { adsetId: text(ad?.adsetId) } : {}),
        ...(ad?.format === "video" || ad?.format === "image"
          ? { format: ad.format }
          : {}),
        ...(text(ad?.mediaUrl) ? { mediaUrl: text(ad?.mediaUrl) } : {}),
        ...(metrics ? { metrics } : {}),
        ...(text(ad?.siblingComparison)
          ? { siblingComparison: text(ad?.siblingComparison) }
          : {}),
        ...(text(ad?.resultShare)
          ? { resultShare: text(ad?.resultShare) }
          : {}),
        ...(text(ad?.value) ? { value: text(ad?.value) } : {}),
        ...(text(ad?.whyItWorks) ? { whyItWorks: text(ad?.whyItWorks) } : {}),
        action,
      },
    });
  }

  if (items.length === 0) {
    return failure("No ads matched a synced campaign.");
  }

  upsertDetailBarItems(session, adsField, items);

  // The verdicts are the only derived root field: recount the chips.
  const campaignItems: BarItemInput[] = [];
  for (const parentId of new Set(items.map((item) => item.parentId!))) {
    const parent = getDetailBarItemById(session.id, parentId);
    if (!parent) continue;

    const chips: Record<string, number> = {};
    for (const ad of readChildRows(session.id, adsField, [parentId])) {
      const data = ad.data as Record<string, unknown>;
      if (data.category === "winner") chips.winners = (chips.winners ?? 0) + 1;
      if (data.category === "scaler") chips.scalers = (chips.scalers ?? 0) + 1;
      if (data.category === "loser") chips.losers = (chips.losers ?? 0) + 1;
      if (data.category === "potential")
        chips.potential = (chips.potential ?? 0) + 1;
    }

    const { chips: _oldChips, ...rest } = parent.data as Record<
      string,
      unknown
    >;
    campaignItems.push({
      id: parentId,
      data: {
        ...rest,
        ...(Object.keys(chips).length > 0 ? { chips } : {}),
      },
    });
  }
  if (campaignItems.length > 0) {
    upsertDetailBarItems(session, "campaigns", campaignItems);
  }

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `Classified ${items.length} ad(s).`,
        },
      ],
    },
  };
}
