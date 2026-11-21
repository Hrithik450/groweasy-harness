import { ToolInput, ToolOutput } from "@/lib/tools/types";
import {
  upsertConnector,
  getConnectorByUserIdAndSlug,
  normalizeInstanceKey,
} from "@/lib/services/connectors.service";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import type {
  BrandTheme,
  CompetitorProfileItem,
  BusinessProfileConnectorSchema,
  BusinessProfileKeywords,
  Country,
} from "@/lib/connectors/business.profile";
import {
  normalizeBusinessProfilePayload,
  mergeBusinessProfilePayload,
} from "../utils";

export const updateBusinessProfileToolDefinition = {
  type: "function" as const,
  name: "updateBusinessProfile",
  description:
    "Updates and persists the Business Profile (Branding, Geography, and Competitors). Merges updates with existing profile data or creates a new profile entry if none exists.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "Official website URL of the brand (e.g. 'https://brand.com').",
      },
      brand: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Official brand name.",
          },
          overview: {
            type: "string",
            description:
              "Rich, curated Markdown overview: 2 to 4 sweet-spot paragraphs summarizing what the brand offers, unique selling points, and core customer benefits.",
          },
          logoUrl: {
            type: "string",
            description:
              "Direct remote URL to official brand logo image, or empty string if not found.",
          },
          fontNames: {
            type: "array",
            items: { type: "string" },
            description:
              "List of brand typography font family names (e.g. ['Inter', 'Plus Jakarta Sans']).",
          },
          fontUrls: {
            type: "array",
            items: { type: "string" },
            description:
              "Direct remote URLs to external or self-hosted brand web font files (e.g. Google Fonts CDN link or .woff2/.ttf font URLs).",
          },
          theme: {
            type: "object",
            properties: {
              primary: {
                type: "string",
                description: "Flagship brand color (hex or CSS color).",
              },
              primaryAccent: {
                type: "string",
                description:
                  "Primary vibrant accent or callout color (hex or CSS color).",
              },
              otherAccents: {
                type: "array",
                items: { type: "string" },
                description:
                  "Optional list of additional secondary/tertiary accent colors (hex or CSS color).",
              },
              background: {
                type: "string",
                description:
                  "Canvas or surface background color (hex or CSS color).",
              },
              secondary: {
                type: "string",
                description:
                  "Supporting secondary brand color (hex or CSS color).",
              },
              foreground: {
                type: "string",
                description:
                  "High-contrast text or foreground color (hex or CSS color).",
              },
              radius: {
                type: "string",
                description:
                  "Border curve styling of overall component's general/average shape (e.g. '0.75rem').",
              },
            },
            description: "Structured design tokens and brand color palette.",
          },
          keywords: {
            type: "object",
            properties: {
              broadPhrases: {
                type: "array",
                items: { type: "string" },
                description:
                  "Broad category and industry keywords representing the brand (e.g. ['AI CRM', 'Lead Management Software']).",
              },
              productOrServicePhrases: {
                type: "array",
                items: { type: "string" },
                description:
                  "Specific product or service phrasing representing the brand offerings (e.g. ['Automated lead distribution', 'Instant WhatsApp followups']).",
              },
            },
            description:
              "Target search keywords and category phrases representing the brand.",
          },
        },
      },
      geography: {
        type: "object",
        properties: {
          countries: {
            type: "array",
            items: { type: "string" },
            description:
              "List of operating country names (e.g. ['India', 'United States']). Note: Do NOT dig deep into sub-regions or cities on the internet; only provide operating country names.",
          },
          languages: {
            type: "array",
            items: { type: "string" },
            description:
              "Operating and customer support languages (e.g. ['English', 'Hindi']).",
          },
        },
        description:
          "Operating countries, scope, and customer languages. Country names and languages are needed; users add specific cities/regions in the UI.",
      },
      competitors: {
        type: "object",
        properties: {
          competitors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Competitor brand name." },
                logo: {
                  type: "string",
                  description: "Competitor logo image URL if available.",
                },
                website: {
                  type: "string",
                  description: "Competitor website URL.",
                },
                overview: {
                  type: "string",
                  description:
                    "Concise 3 to 4 lines paragraph of what this competitor does, their core offerings, and market positioning.",
                },
                ads: {
                  type: "array",
                  description:
                    "Recent ads for this competitor. Each ad carries the Meta Ad Library ID and the creative URLs that searchAdLibrary returned; invalid URLs are dropped.",
                  items: {
                    type: "object",
                    properties: {
                      id: {
                        type: "string",
                        description:
                          "Meta Ad Library ID returned by searchAdLibrary.",
                      },
                      media: {
                        type: "array",
                        description:
                          "Creative URLs for this ad. Omit to use the cached ones.",
                        items: {
                          type: "object",
                          properties: {
                            kind: {
                              type: "string",
                              enum: ["video", "image"],
                            },
                            url: { type: "string" },
                          },
                          required: ["kind", "url"],
                        },
                      },
                    },
                    required: ["id"],
                  },
                },
              },
              required: ["name"],
            },
            description:
              "List of competitors with their overviews and recent ads.",
          },
        },
      },
    },
  },
};

export interface UpdateBusinessProfileArgs {
  url?: string;
  brand?: {
    name?: string;
    overview?: string;
    logoUrl?: string;
    fontNames?: string[];
    fontUrls?: string[];
    theme?: Partial<BrandTheme>;
    keywords?: BusinessProfileKeywords;
  };
  geography?: {
    scope?: "worldwide" | "nationwide" | "specific";
    countries?: string[] | Country[];
    languages?: string[];
  };
  competitors?: {
    competitors?: CompetitorProfileItem[];
  };
}

export async function executeUpdateBusinessProfileTool(
  input: ToolInput<UpdateBusinessProfileArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    const errorMsg =
      "User authentication context required to update Business Profile.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  try {
    const requestedInstance = input.args?.url
      ? (normalizeInstanceKey(input.args.url) ?? undefined)
      : undefined;
    const existingRes = await getConnectorByUserIdAndSlug(
      userId,
      "businessProfile",
      requestedInstance,
    );
    const existingConnector = existingRes?.data;

    let finalProfile: BusinessProfileConnectorSchema;
    if (existingConnector?.metadata) {
      const existingProfile = normalizeBusinessProfilePayload(
        existingConnector.metadata,
        (existingConnector.metadata as { url?: string })?.url,
      );
      finalProfile = mergeBusinessProfilePayload(existingProfile, input.args);
    } else {
      finalProfile = normalizeBusinessProfilePayload(
        input.args,
        input.args?.url,
      );
    }

    const res = await upsertConnector({
      userId,
      slug: "businessProfile",
      instance: existingConnector?.instance ?? requestedInstance,
      providerSlug: "adsEasy",
      status: "connected",
      metadata: finalProfile as unknown as Record<string, unknown>,
    });

    if (!res.success) {
      throw new Error(
        res.error || "Failed to persist business profile connector.",
      );
    }

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Successfully updated business profile for "${finalProfile.brand.name}" (${finalProfile.url}).`,
          },
        ],
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Error updating business profile: ${errorMsg}`,
          },
        ],
      },
      error: errorMsg,
    };
  }
}
