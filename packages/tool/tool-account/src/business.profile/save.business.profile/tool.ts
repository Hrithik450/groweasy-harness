import type { Session } from "@openai-harness/session";
import {
  upsertConnector,
  getConnectorByUserIdAndSlug,
  deleteConnector,
} from "@openai-harness/connector";
import type {
  BrandTheme,
  CompetitorProfileItem,
  BusinessProfileConnectorSchema,
  BusinessProfileKeywords,
  Country,
} from "@openai-harness/connector-business-profile";
import {
  attachCollectedMedia,
  normalizeBusinessProfilePayload,
  mergeBusinessProfilePayload,
} from "../utils";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface SaveBusinessProfileArgs {
  clear?: boolean;
  url?: string;
  brand?: {
    name?: string;
    overview?: string;
    logoUrl?: string;
    keywords?: BusinessProfileKeywords;
    theme?: BrandTheme;
  };
  geography?: {
    operatingCountries?: Country[];
  };
  competitors?: {
    competitors?: CompetitorProfileItem[];
  };
}

/** Minimum recent ads expected when a competitor runs ads at all. */
const MIN_COMPETITOR_ADS = 3;

/**
 * Competitors are valid with zero ads (some brands do not run Meta ads), but
 * an under-filled list means the research stopped short. Never reject the
 * payload for it — surface the gap in the save summary instead.
 */
function competitorAdWarnings(profile: BusinessProfileConnectorSchema): string[] {
  const warnings: string[] = [];
  for (const competitor of profile.competitors?.competitors || []) {
    const adCount = competitor.ads?.length ?? 0;
    if (adCount > 0 && adCount < MIN_COMPETITOR_ADS) {
      warnings.push(
        `"${competitor.name}" has ${adCount} ad${adCount === 1 ? "" : "s"}; collect at least ${MIN_COMPETITOR_ADS} recent ads when the competitor runs ads.`,
      );
    }
  }
  return warnings;
}

export const saveBusinessProfileTool = defineTool({
  name: "saveBusinessProfile",
  description:
    "Saves and persists brand identity, design tokens, geography, and competitors into the Business Profile connector.",
  timeoutMs: 15000,
  isConcurrencySafe: () => false,
  parameters: {
    clear: {
      type: "boolean",
      description: "Clear existing profile before saving.",
    },
    url: {
      type: "string",
      description: "Official brand website URL (e.g. 'https://brand.com').",
    },
    brand: {
      type: "object",
      additionalProperties: true,
      description:
        "Brand identity, overview, typography, palette, and search keywords (at most 10 broadPhrases and 10 productOrServicePhrases).",
      properties: {
        name: { type: "string" },
        overview: { type: "string" },
        logoUrl: { type: "string" },
        keywords: {
          type: "object",
          additionalProperties: true,
          properties: {
            broadPhrases: {
              type: "array",
              items: { type: "string" },
              description: "At most 10 category phrases.",
            },
            productOrServicePhrases: {
              type: "array",
              items: { type: "string" },
              description: "At most 10 product/service phrases.",
            },
          },
        },
      },
    },
    geography: {
      type: "object",
      additionalProperties: true,
      description: "Operating countries and locales.",
    },
    competitors: {
      type: "object",
      additionalProperties: true,
      description:
        "Direct competitor profiles. Competitors carry no keywords of their own; merge any phrases found while profiling into brand.keywords within its 10/10 caps.",
      properties: {
        competitors: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              name: { type: "string" },
              website: { type: "string" },
              logo: { type: "string" },
              overview: { type: "string" },
              ads: {
                type: "array",
                description:
                  "Recent ads; at least 3 when the competitor runs ads, otherwise an empty array.",
                items: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    format: { type: "string", enum: ["video", "static"] },
                    adUrl: {
                      type: "string",
                      description: "Meta Ad Library ad URL from the collector.",
                    },
                    mediaUrls: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Collector-supplied creative media URL(s), used by the UI as-is.",
                    },
                    label: { type: "string" },
                  },
                },
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
        summary: { type: "string", required: true },
        profile: { type: "object", additionalProperties: true },
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
    title: `Save business profile${args.brand?.name ? `: ${args.brand.name}` : ""}`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "edit",
    title: "Business profile saved",
    content: result.content,
  }),
  async execute(args, exec) {
    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error("User authentication context is required to save business profile.");
    }

    if (args.clear) {
      await deleteConnector(userId, "businessProfile");
      return {
        profile: {},
        summary: "Business profile cleared successfully.",
      };
    }

    const normalizedIncoming = normalizeBusinessProfilePayload(args as any);

    let existingMetadata: BusinessProfileConnectorSchema | null = null;
    try {
      const existingRes = await getConnectorByUserIdAndSlug(userId, "businessProfile");
      if (
        existingRes.success &&
        existingRes.data &&
        existingRes.data.status === "connected" &&
        existingRes.data.metadata
      ) {
        existingMetadata = existingRes.data.metadata as unknown as BusinessProfileConnectorSchema;
      }
    } catch {
      // ignore
    }

    const mergedProfile = existingMetadata
      ? mergeBusinessProfilePayload(existingMetadata, normalizedIncoming)
      : normalizedIncoming;

    // Creative URLs come from the crawl that captured the ad, never from the
    // model's transcription — it routinely drops the long signed ones. This
    // also heals profiles saved before the lookup existed.
    const finalProfile: BusinessProfileConnectorSchema = {
      ...mergedProfile,
      ...(mergedProfile.competitors
        ? {
            competitors: {
              ...mergedProfile.competitors,
              competitors: await attachCollectedMedia(
                mergedProfile.competitors.competitors,
              ),
            },
          }
        : {}),
    };

    const upsertRes = await upsertConnector({
      userId,
      slug: "businessProfile",
      providerSlug: "adsEasy",
      status: "connected",
      // The profile is saved — clear the analysis flag here too, so the UI
      // reflects the result even if the workflow is still finishing.
      syncStatus: "idle",
      metadata: finalProfile as any,
    });

    if (!upsertRes.success) {
      throw new Error(upsertRes.error || "Failed to save business profile connector.");
    }

    const warnings = competitorAdWarnings(finalProfile);
    const summary = `Business profile saved successfully for brand "${finalProfile.brand.name}".${
      warnings.length > 0
        ? `\n\nAd coverage warnings:\n${warnings.map((w) => `- ${w}`).join("\n")}`
        : ""
    }`;

    return {
      profile: finalProfile as unknown as Record<string, any>,
      summary,
    };
  },
});
