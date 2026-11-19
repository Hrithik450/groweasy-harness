import {
  classifyCampaignAds,
  readAdsForClassification,
  type AdClassification,
} from "@/lib/bar/service";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

const MAX_ADS_PER_CALL = 60;

const CLASSIFICATIONS = [
  "winner",
  "scaler",
  "potential",
  "loser",
  "untested",
] as const;

type Classification = (typeof CLASSIFICATIONS)[number];

export const readCampaignAdsToolDefinition = {
  type: "function" as const,
  name: "readCampaignAds",
  preSkills: "campaign-health",
  description:
    "Reads every ad currently in the Ad Manager Campaigns tab, with the metrics already derived from Meta: name, ad set, spend, impressions, clicks, CTR, results, frequency, CPA, ROAS, and its current classification.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
};

export const updateCampaignAdsToolDefinition = {
  type: "function" as const,
  name: "updateCampaignAds",
  preSkills: "campaign-health",
  description:
    "Saves one classification per ad: winner, scaler, potential, loser, or untested. Metrics are not accepted here — they are derived from Meta; this writes only the verdict.",
  parameters: {
    type: "object",
    properties: {
      ads: {
        type: "array",
        maxItems: MAX_ADS_PER_CALL,
        description: "One verdict per ad, keyed by the ad id from readCampaignAds.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Meta ad id, exactly as readCampaignAds returned it.",
            },
            classification: {
              type: "string",
              enum: CLASSIFICATIONS,
            },
          },
          required: ["id", "classification"],
          additionalProperties: false,
        },
      },
    },
    required: ["ads"],
  },
};

type ReadOutput = { contentParts: Array<InputContentParam> };

export async function executeReadCampaignAdsTool(
  input: ToolInput<Record<string, never>>,
): Promise<ToolOutput<ReadOutput>> {
  const userId = input.context?.userId;
  if (!userId) {
    return failure("User authentication context is required to read ads.");
  }

  const ads = readAdsForClassification(userId);
  if (ads === null) {
    return failure("Ad Manager session not found for this user.");
  }

  return {
    success: true,
    data: {
      contentParts: [{ type: "input_text", text: JSON.stringify(ads) }],
    },
  };
}

interface UpdateCampaignAdsArgs {
  ads?: Array<{ id?: string; classification?: string }>;
}

type UpdateOutput = { contentParts: Array<InputContentParam> };

export async function executeUpdateCampaignAdsTool(
  input: ToolInput<UpdateCampaignAdsArgs>,
): Promise<ToolOutput<UpdateOutput>> {
  const userId = input.context?.userId;
  if (!userId) {
    return failure("User authentication context is required to classify ads.");
  }

  const raw = input.args?.ads;
  if (!Array.isArray(raw) || raw.length === 0) {
    return failure("The 'ads' array parameter is required.");
  }

  const entries: AdClassification[] = [];
  for (const ad of raw.slice(0, MAX_ADS_PER_CALL)) {
    const id = typeof ad?.id === "string" ? ad.id.trim() : "";
    const category =
      typeof ad?.classification === "string"
        ? ad.classification.trim().toLowerCase()
        : "";
    if (!id) return failure("Every ad needs a non-empty 'id'.");
    if (!CLASSIFICATIONS.includes(category as Classification)) {
      return failure(
        `Unknown classification "${category}"; use ${CLASSIFICATIONS.join(", ")}.`,
      );
    }
    entries.push({ id, category });
  }

  const result = classifyCampaignAds(userId, entries);
  if (result === null) {
    return failure("Ad Manager session not found for this user.");
  }

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `Classified ${result.updated} ad(s).`,
        },
      ],
    },
  };
}
