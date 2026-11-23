import {
  readChildRows,
  readAllRootRows,
  readBarItemFor,
  getDetailBarItemById,
  resolveDetailBarSession,
  upsertDetailBarItems,
  type BarItemInput,
} from "@/lib/detail.bar/service";
import { tabChildFields } from "@/lib/detail.bar/fields";
import {
  AD_CATEGORIES,
  type AdCategory,
  type BarCard,
  type CampaignAd,
  type CampaignAdAction,
  type CampaignAdMeta,
} from "@/lib/detail.bar/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

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
            meta: {
              type: "object",
              description: "Meta identifiers for the ad and its placement.",
              properties: {
                adAccountId: {
                  type: "string",
                  description: "Ad account id, e.g. 'act_1202159847230100'.",
                },
                campaignId: {
                  type: "string",
                  description:
                    "Campaign id; the ad is attached to this campaign.",
                },
                adSetId: {
                  type: "string",
                  description: "Ad set id, if relevant.",
                },
                adId: {
                  type: "string",
                  description: "Meta ad id, same as `id`.",
                },
                creativeId: {
                  type: "string",
                  description: "Meta creative ID, if relevant.",
                },
              },
              required: ["campaignId"],
              additionalProperties: false,
            },
            name: {
              type: "string",
              description: "Meta ad name, exactly as fetchMetaAds returned it.",
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
            "meta",
            "name",
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
    Required<Omit<CampaignAd, "action" | "meta" | "adsetId">> & {
      meta: CampaignAdMeta;
      action: CampaignAdAction;
    }
  >;
};

type AdInput = NonNullable<UpsertAdsClassifiedArgs["ads"]>[number];

/** Optional text, trimmed; blank becomes undefined. */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Validate one submitted ad and fill its required identifiers. */
function normaliseAd(ad: AdInput): {
  ad?: AdInput & { id: string; category: AdCategory; meta: CampaignAdMeta };
  error?: string;
} {
  const rawMeta = ad.meta ?? {};
  const meta: CampaignAdMeta = {
    ...(text(rawMeta.adAccountId)
      ? { adAccountId: text(rawMeta.adAccountId)! }
      : {}),
    campaignId: text(rawMeta.campaignId) ?? "",
    ...(text(rawMeta.adSetId) ? { adSetId: text(rawMeta.adSetId)! } : {}),
    ...(text(rawMeta.adId) ? { adId: text(rawMeta.adId)! } : {}),
    ...(text(rawMeta.creativeId)
      ? { creativeId: text(rawMeta.creativeId)! }
      : {}),
  };

  const id = text(ad.id) ?? meta.adId ?? "";
  if (!id) return { error: "Every ad needs a non-empty 'id'." };

  const category = text(ad.category)?.toLowerCase() ?? "";
  if (!AD_CATEGORIES.includes(category as AdCategory)) {
    return {
      error: `Unknown category "${category}"; use ${AD_CATEGORIES.join(", ")}.`,
    };
  }

  if (!text(ad.action?.fix)) {
    return { error: "Every ad needs an action.fix." };
  }

  return {
    ad: { ...ad, id, category: category as AdCategory, meta },
  };
}

/** One ad merged onto its stored row; user-owned fields stay untouched. */
function mergeAd(
  ad: AdInput & { id: string; category: AdCategory; meta: CampaignAdMeta },
  existing: BarCard<CampaignAd> | undefined,
): CampaignAd {
  const previous = existing?.meta;
  const adAccountId = ad.meta.adAccountId ?? previous?.adAccountId ?? "";
  const campaignId = ad.meta.campaignId || previous?.campaignId || "";
  const adSetId = ad.meta.adSetId ?? previous?.adSetId;
  const adId = ad.meta.adId ?? previous?.adId ?? ad.id;
  const creativeId = ad.meta.creativeId ?? previous?.creativeId;

  const fix = text(ad.action?.fix) ?? existing?.action?.fix ?? "";
  const before = text(ad.action?.before) ?? existing?.action?.before;
  const after = text(ad.action?.after) ?? existing?.action?.after;

  const format = ad.format ?? existing?.format;
  const mediaUrl = text(ad.mediaUrl) ?? existing?.mediaUrl;
  const metrics = ad.metrics
    ? { ...(existing?.metrics ?? {}), ...ad.metrics }
    : existing?.metrics;

  const siblingComparison =
    text(ad.siblingComparison) ?? existing?.siblingComparison;
  const resultShare = text(ad.resultShare) ?? existing?.resultShare;
  const value = text(ad.value) ?? existing?.value;
  const whyItWorks = text(ad.whyItWorks) ?? existing?.whyItWorks;

  return {
    id: ad.id,
    name: text(ad.name) ?? existing?.name ?? "Ad",
    category: ad.category,
    meta: {
      adAccountId,
      campaignId,
      ...(adSetId ? { adSetId } : {}),
      adId,
      ...(creativeId ? { creativeId } : {}),
    },
    ...(adSetId ? { adsetId: adSetId } : {}),
    ...(format ? { format } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(metrics ? { metrics } : {}),
    ...(siblingComparison ? { siblingComparison } : {}),
    ...(resultShare ? { resultShare } : {}),
    ...(value ? { value } : {}),
    ...(whyItWorks ? { whyItWorks } : {}),
    action: {
      fix,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    },
  };
}

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

  const items: BarItemInput[] = [];
  const saved: CampaignAd[] = [];
  for (const rawAd of raw) {
    const normalised = normaliseAd(rawAd);
    if (normalised.error !== undefined) return failure(normalised.error);
    const ad = normalised.ad!;
    if (!ad.meta.campaignId || !campaignIds.has(ad.meta.campaignId)) continue;

    const stored = readBarItemFor(
      userId,
      adsField,
      ad.id,
    ) as BarCard<CampaignAd> | null;
    const data = mergeAd(ad, stored ?? undefined);
    saved.push(data);
    items.push({
      id: data.id,
      parentId: ad.meta.campaignId,
      ...(stored?.status ? { status: stored.status } : {}),
      data,
    });
  }

  if (items.length === 0) {
    return failure("No ads matched a synced campaign.");
  }

  upsertDetailBarItems(session, adsField, items);

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

  // Hand the model the ids it just saved, so a later call can cite them.
  const savedLines = saved
    .map((ad) => `- ${ad.category} · ${ad.id}${ad.name ? ` · ${ad.name}` : ""}`)
    .join("\n");

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `Classified ${saved.length} ad(s):\n${savedLines}`,
        },
      ],
    },
  };
}
