import type { Session } from "@openai-harness/session";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";
import { mutateDetailBarState } from "@openai-harness/session-persistence";

type CampaignAdClassification =
  | "winner"
  | "scaler"
  | "loser"
  | "potential"
  | "untested";

type CampaignAdFormat = "video" | "static" | "carousel";

type CampaignStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

interface CampaignAdAction {
  fix: string;
  before?: string;
  after?: string;
  moneyValue?: string;
}

interface CampaignAdSecondaryAction {
  label: string;
  prompt?: string;
}

interface CampaignAd {
  id: string;
  name: string;
  classification: CampaignAdClassification;
  format?: CampaignAdFormat;
  daysActive?: number;
  impressions?: number;
  cpa?: string;
  roas?: string;
  siblingComparison?: string;
  resultShare?: string;
  hook?: string;
  whyItWorks?: string;
  metricLines?: string[];
  insight?: string;
  actionLabel?: string;
  savings?: string;
  action?: CampaignAdAction;
  secondaryAction?: CampaignAdSecondaryAction;
  thumbnailLabel?: string;
}

interface CampaignChips {
  winners?: number;
  scalers?: number;
  losers?: number;
  potential?: number;
}

interface Campaign {
  id: string;
  name: string;
  objective?: string;
  status?: CampaignStatus;
  subtitle?: string;
  statusLabel?: string;
  isDraft?: boolean;
  descriptiveLine?: string;
  dailyBudget?: string | number;
  budgetFormatted?: string;
  spend?: string;
  purchases?: number | string;
  cpa?: string;
  roas?: string;
  ctr?: string;
  cpm?: string;
  frequency?: string;
  clicks?: number | string;
  impressions?: number | string;
  revenue?: string;
  leads?: number | string;
  cpl?: string;
  chips?: CampaignChips;
  ads?: CampaignAd[];
}

const MAX_CAMPAIGNS = 25;
const CLASSIFICATIONS: readonly CampaignAdClassification[] = [
  "winner",
  "scaler",
  "loser",
  "potential",
  "untested",
];
const FORMATS: readonly CampaignAdFormat[] = ["video", "static", "carousel"];
const STATUSES: readonly CampaignStatus[] = [
  "ACTIVE",
  "PAUSED",
  "DELETED",
  "ARCHIVED",
];

/** Stable id for a campaign or ad the caller created without one. */
function generateId(prefix: "campaign" | "ad"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Display string for money/metric fields the UI types require as strings. */
function asDisplayString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Number-or-string fields the UI renders as-is (`purchases`, `clicks`, …). */
function asScalar(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function classify(value: unknown): CampaignAdClassification | undefined {
  return typeof value === "string" &&
    (CLASSIFICATIONS as readonly string[]).includes(value)
    ? (value as CampaignAdClassification)
    : undefined;
}

function formatOf(value: unknown): CampaignAdFormat | undefined {
  return typeof value === "string" && (FORMATS as readonly string[]).includes(value)
    ? (value as CampaignAdFormat)
    : undefined;
}

function statusOf(value: unknown): CampaignStatus | undefined {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value)
    ? (value as CampaignStatus)
    : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

/** Keep only non-zero counts; a chip at 0 is not rendered. */
function normalizeChips(
  value: Record<string, unknown>,
): CampaignChips | undefined {
  const chips: CampaignChips = {};
  for (const key of ["winners", "scalers", "losers", "potential"] as const) {
    const count = asFiniteNumber(value[key]);
    if (count !== undefined && count > 0) chips[key] = count;
  }
  return Object.keys(chips).length > 0 ? chips : undefined;
}

/** Derive the campaign card chips from its merged ads. */
function deriveChips(ads: readonly CampaignAd[]): CampaignChips | undefined {
  const counts: Record<Exclude<CampaignAdClassification, "untested">, number> = {
    winner: 0,
    scaler: 0,
    loser: 0,
    potential: 0,
  };
  for (const ad of ads) {
    if (ad.classification !== "untested") counts[ad.classification] += 1;
  }
  const chips: CampaignChips = {};
  if (counts.winner > 0) chips.winners = counts.winner;
  if (counts.scaler > 0) chips.scalers = counts.scaler;
  if (counts.loser > 0) chips.losers = counts.loser;
  if (counts.potential > 0) chips.potential = counts.potential;
  return Object.keys(chips).length > 0 ? chips : undefined;
}

/**
 * Merge one supplied ad into its existing record.
 *
 * Every field the caller omits keeps its existing value; a new ad is created
 * when no `id` matches. `classification` defaults to `untested` only because
 * the UI requires one, never as an inferred performance verdict.
 */
function mergeAd(rawAd: unknown, existing?: CampaignAd): CampaignAd | undefined {
  const raw = asRecord(rawAd);
  if (!raw) return existing;

  const existingAction = existing?.action;
  const rawAction = asRecord(raw.action);
  const actionFix =
    asDisplayString(rawAction?.fix) ?? existingAction?.fix ?? "Inspect ad";
  const action: CampaignAdAction | undefined =
    rawAction || existingAction
      ? {
          fix: actionFix,
          ...(asDisplayString(rawAction?.before) ?? existingAction?.before
            ? { before: asDisplayString(rawAction?.before) ?? existingAction?.before }
            : {}),
          ...(asDisplayString(rawAction?.after) ?? existingAction?.after
            ? { after: asDisplayString(rawAction?.after) ?? existingAction?.after }
            : {}),
          ...(asDisplayString(rawAction?.moneyValue) ?? existingAction?.moneyValue
            ? {
                moneyValue:
                  asDisplayString(rawAction?.moneyValue) ??
                  existingAction?.moneyValue,
              }
            : {}),
        }
      : undefined;

  const existingSecondary = existing?.secondaryAction;
  const rawSecondary = asRecord(raw.secondaryAction);
  const secondaryLabel =
    asDisplayString(rawSecondary?.label) ?? existingSecondary?.label;
  const secondaryAction: CampaignAdSecondaryAction | undefined =
    rawSecondary || existingSecondary
      ? {
          label: secondaryLabel ?? "Optimise",
          ...(asDisplayString(rawSecondary?.prompt) ?? existingSecondary?.prompt
            ? {
                prompt:
                  asDisplayString(rawSecondary?.prompt) ??
                  existingSecondary?.prompt,
              }
            : {}),
        }
      : undefined;

  return {
    ...(existing ?? {}),
    id: asDisplayString(raw.id) ?? existing?.id ?? generateId("ad"),
    name: asDisplayString(raw.name) ?? existing?.name ?? "Ad",
    classification:
      classify(raw.classification) ?? existing?.classification ?? "untested",
    ...(formatOf(raw.format) ?? existing?.format
      ? { format: formatOf(raw.format) ?? existing?.format }
      : {}),
    ...(asFiniteNumber(raw.daysActive) ?? existing?.daysActive
      ? { daysActive: asFiniteNumber(raw.daysActive) ?? existing?.daysActive }
      : {}),
    ...(asFiniteNumber(raw.impressions) ?? existing?.impressions
      ? {
          impressions:
            asFiniteNumber(raw.impressions) ?? existing?.impressions,
        }
      : {}),
    ...(asDisplayString(raw.cpa) ?? existing?.cpa
      ? { cpa: asDisplayString(raw.cpa) ?? existing?.cpa }
      : {}),
    ...(asDisplayString(raw.roas) ?? existing?.roas
      ? { roas: asDisplayString(raw.roas) ?? existing?.roas }
      : {}),
    ...(asDisplayString(raw.siblingComparison) ?? existing?.siblingComparison
      ? {
          siblingComparison:
            asDisplayString(raw.siblingComparison) ??
            existing?.siblingComparison,
        }
      : {}),
    ...(asDisplayString(raw.resultShare) ?? existing?.resultShare
      ? {
          resultShare:
            asDisplayString(raw.resultShare) ?? existing?.resultShare,
        }
      : {}),
    ...(asDisplayString(raw.hook) ?? existing?.hook
      ? { hook: asDisplayString(raw.hook) ?? existing?.hook }
      : {}),
    ...(asDisplayString(raw.whyItWorks) ?? existing?.whyItWorks
      ? { whyItWorks: asDisplayString(raw.whyItWorks) ?? existing?.whyItWorks }
      : {}),
    ...(stringList(raw.metricLines) ?? existing?.metricLines
      ? {
          metricLines:
            stringList(raw.metricLines) ?? existing?.metricLines,
        }
      : {}),
    ...(asDisplayString(raw.insight) ?? existing?.insight
      ? { insight: asDisplayString(raw.insight) ?? existing?.insight }
      : {}),
    ...(asDisplayString(raw.actionLabel) ?? existing?.actionLabel
      ? {
          actionLabel:
            asDisplayString(raw.actionLabel) ?? existing?.actionLabel,
        }
      : {}),
    ...(asDisplayString(raw.savings) ?? existing?.savings
      ? { savings: asDisplayString(raw.savings) ?? existing?.savings }
      : {}),
    ...(asDisplayString(raw.thumbnailLabel) ?? existing?.thumbnailLabel
      ? {
          thumbnailLabel:
            asDisplayString(raw.thumbnailLabel) ?? existing?.thumbnailLabel,
        }
      : {}),
    ...(action ? { action } : {}),
    ...(secondaryAction ? { secondaryAction } : {}),
  };
}

/** Merge supplied ads by `id`; new ads go to the front, order preserved. */
function mergeAds(
  rawAds: readonly unknown[],
  existingAds: readonly CampaignAd[],
): CampaignAd[] {
  const merged = [...existingAds];
  const incoming: CampaignAd[] = [];
  for (const rawAd of rawAds) {
    const raw = asRecord(rawAd);
    if (!raw) continue;
    const id = asDisplayString(raw.id);
    const existing = id ? merged.find((ad) => ad.id === id) : undefined;
    const ad = mergeAd(raw, existing);
    if (ad) incoming.push(ad);
  }

  const newAds: CampaignAd[] = [];
  for (const ad of incoming) {
    const index = merged.findIndex((item) => item.id === ad.id);
    if (index >= 0) merged[index] = ad;
    else newAds.push(ad);
  }
  return [...newAds, ...merged];
}

/**
 * Merge one supplied campaign into its existing record, including its ads.
 *
 * The existing object spreads first, so a field the caller omits is preserved
 * even when it is not part of the typed subset this tool knows about.
 */
function mergeCampaign(
  rawCampaign: unknown,
  existing?: Campaign,
): Campaign | undefined {
  const raw = asRecord(rawCampaign);
  if (!raw) return existing;

  const existingAds = Array.isArray(existing?.ads) ? existing.ads : [];
  const suppliedAds = Array.isArray(raw.ads) ? raw.ads : [];
  const ads = mergeAds(suppliedAds, existingAds);

  const suppliedChips = asRecord(raw.chips);
  const chips = suppliedChips
    ? normalizeChips(suppliedChips)
    : ads.length > 0
      ? deriveChips(ads)
      : existing?.chips;

  const isDraft =
    typeof raw.isDraft === "boolean" ? raw.isDraft : undefined;

  const merged: Campaign = {
    ...(existing ?? {}),
    id: asDisplayString(raw.id) ?? existing?.id ?? generateId("campaign"),
    name: asDisplayString(raw.name) ?? existing?.name ?? "Campaign",
    ...(asDisplayString(raw.objective) ?? existing?.objective
      ? {
          objective:
            asDisplayString(raw.objective) ?? existing?.objective,
        }
      : {}),
    ...(statusOf(raw.status) ?? existing?.status
      ? { status: statusOf(raw.status) ?? existing?.status }
      : {}),
    ...(asDisplayString(raw.subtitle) ?? existing?.subtitle
      ? { subtitle: asDisplayString(raw.subtitle) ?? existing?.subtitle }
      : {}),
    ...(asDisplayString(raw.statusLabel) ?? existing?.statusLabel
      ? {
          statusLabel:
            asDisplayString(raw.statusLabel) ?? existing?.statusLabel,
        }
      : {}),
    ...(isDraft !== undefined ? { isDraft } : {}),
    ...(asDisplayString(raw.descriptiveLine) ?? existing?.descriptiveLine
      ? {
          descriptiveLine:
            asDisplayString(raw.descriptiveLine) ?? existing?.descriptiveLine,
        }
      : {}),
    ...(asScalar(raw.dailyBudget) ?? existing?.dailyBudget
      ? {
          dailyBudget:
            asScalar(raw.dailyBudget) ?? existing?.dailyBudget,
        }
      : {}),
    ...(asDisplayString(raw.budgetFormatted) ?? existing?.budgetFormatted
      ? {
          budgetFormatted:
            asDisplayString(raw.budgetFormatted) ??
            existing?.budgetFormatted,
        }
      : {}),
    ...(asDisplayString(raw.spend) ?? existing?.spend
      ? { spend: asDisplayString(raw.spend) ?? existing?.spend }
      : {}),
    ...(asScalar(raw.purchases) ?? existing?.purchases
      ? { purchases: asScalar(raw.purchases) ?? existing?.purchases }
      : {}),
    ...(asDisplayString(raw.cpa) ?? existing?.cpa
      ? { cpa: asDisplayString(raw.cpa) ?? existing?.cpa }
      : {}),
    ...(asDisplayString(raw.roas) ?? existing?.roas
      ? { roas: asDisplayString(raw.roas) ?? existing?.roas }
      : {}),
    ...(asDisplayString(raw.ctr) ?? existing?.ctr
      ? { ctr: asDisplayString(raw.ctr) ?? existing?.ctr }
      : {}),
    ...(asDisplayString(raw.cpm) ?? existing?.cpm
      ? { cpm: asDisplayString(raw.cpm) ?? existing?.cpm }
      : {}),
    ...(asDisplayString(raw.frequency) ?? existing?.frequency
      ? {
          frequency:
            asDisplayString(raw.frequency) ?? existing?.frequency,
        }
      : {}),
    ...(asScalar(raw.clicks) ?? existing?.clicks
      ? { clicks: asScalar(raw.clicks) ?? existing?.clicks }
      : {}),
    ...(asScalar(raw.impressions) ?? existing?.impressions
      ? {
          impressions:
            asScalar(raw.impressions) ?? existing?.impressions,
        }
      : {}),
    ...(asDisplayString(raw.revenue) ?? existing?.revenue
      ? { revenue: asDisplayString(raw.revenue) ?? existing?.revenue }
      : {}),
    ...(asScalar(raw.leads) ?? existing?.leads
      ? { leads: asScalar(raw.leads) ?? existing?.leads }
      : {}),
    ...(asDisplayString(raw.cpl) ?? existing?.cpl
      ? { cpl: asDisplayString(raw.cpl) ?? existing?.cpl }
      : {}),
    ...(chips ? { chips } : {}),
    ...(ads.length > 0 ? { ads } : {}),
  };

  // Replacing ads re-derives chips; a run that leaves no labelled ads must
  // clear stale chips rather than keeping the previous count. The key is
  // deleted (not set to undefined) so the state stays losslessly JSON-safe.
  if (Array.isArray(raw.ads) && !chips) delete merged.chips;

  return merged;
}

export const updateCampaignsTool = defineTool({
  name: "updateCampaigns",
  description:
    "Creates or updates campaigns, their ad-level winners/scalers/losers/potential classifications, performance metrics, and per-ad actions in the Ad Manager Campaigns tab for the `campaigns` skill. " +
    "Merges by campaign id and ad id, derives per-campaign summary chips, and preserves fields the caller does not supply.",
  timeoutMs: 15000,
  isConcurrencySafe: () => false,
  parameters: {
    campaigns: {
      type: "array",
      required: true,
      description:
        "Array of 1 to 25 campaign objects to create, merge, or update in the session DetailBar.",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          objective: { type: "string" },
          status: {
            type: "string",
            enum: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"],
          },
          statusLabel: { type: "string" },
          isDraft: { type: "boolean" },
          descriptiveLine: { type: "string" },
          dailyBudget: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          budgetFormatted: { type: "string" },
          spend: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          purchases: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          cpa: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          roas: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          ctr: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          cpm: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          frequency: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          clicks: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          impressions: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          revenue: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          leads: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          cpl: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          ads: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                classification: {
                  type: "string",
                  enum: [
                    "winner",
                    "scaler",
                    "loser",
                    "potential",
                    "untested",
                  ],
                },
                format: {
                  type: "string",
                  enum: ["video", "static", "carousel"],
                },
                daysActive: { type: "number" },
                impressions: { type: "number" },
                cpa: {
                  oneOf: [{ type: "string" }, { type: "number" }],
                },
                roas: {
                  oneOf: [{ type: "string" }, { type: "number" }],
                },
                siblingComparison: { type: "string" },
                resultShare: { type: "string" },
                hook: { type: "string" },
                whyItWorks: { type: "string" },
                metricLines: {
                  type: "array",
                  items: { type: "string" },
                },
                insight: { type: "string" },
                actionLabel: { type: "string" },
                savings: { type: "string" },
                thumbnailLabel: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: true,
      properties: {
        count: { type: "number", required: true },
        summary: { type: "string", required: true },
        campaigns: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: true,
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
    kind: "edit",
    title: `Update campaigns (${args.campaigns?.length ?? 0} items)`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "edit",
    title: "Campaigns updated",
    content: result.content,
  }),
  async execute(args, exec) {
    const session = toolSession<Session>(exec);
    const userId = session.userId;
    const sessionId = session.id;

    if (!userId || !sessionId) {
      throw new Error(
        "Authentication and session context are required to update campaigns.",
      );
    }

    const rawCampaigns = args.campaigns;
    if (!Array.isArray(rawCampaigns) || rawCampaigns.length === 0) {
      throw new Error("The 'campaigns' array parameter is required.");
    }

    let formattedCampaigns: Campaign[] = [];

    await mutateDetailBarState(sessionId, "adManager", (current) => {
      const existingCampaigns: Campaign[] = Array.isArray(
        current.data.campaigns,
      )
        ? (current.data.campaigns as Campaign[])
        : [];
      const existingMap = new Map<string, Campaign>();
      for (const campaign of existingCampaigns) {
        if (campaign?.id) existingMap.set(campaign.id, campaign);
      }

      const nextCampaigns: Campaign[] = [];
      for (const rawCampaign of rawCampaigns.slice(0, MAX_CAMPAIGNS)) {
        const raw = asRecord(rawCampaign);
        if (!raw) continue;
        const id = asDisplayString(raw.id);
        const existing = id ? existingMap.get(id) : undefined;
        const merged = mergeCampaign(raw, existing);
        if (merged) nextCampaigns.push(merged);
      }

      const mergedCampaigns = [...existingCampaigns];
      const newCampaigns: Campaign[] = [];
      for (const campaign of nextCampaigns) {
        const index = mergedCampaigns.findIndex(
          (item) => item?.id === campaign.id,
        );
        if (index >= 0) mergedCampaigns[index] = campaign;
        else newCampaigns.push(campaign);
      }

      const campaigns = [...newCampaigns, ...mergedCampaigns].slice(
        0,
        MAX_CAMPAIGNS,
      );

      formattedCampaigns = nextCampaigns;

      return {
        ...current,
        type: "adManager",
        data: {
          ...current.data,
          campaigns,
        },
      };
    });

    const summary = `Successfully updated ${formattedCampaigns.length} campaign(s) in the Ad Manager DetailBar.`;

    return {
      count: formattedCampaigns.length,
      summary,
      campaigns: formattedCampaigns as any,
    };
  },
});
