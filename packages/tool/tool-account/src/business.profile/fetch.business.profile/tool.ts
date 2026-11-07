import type { Session } from "@openai-harness/session";
import { getConnectorByUserIdAndSlug } from "@openai-harness/connector";
import {
  parseFlatLocations,
  type BusinessProfileConnectorSchema,
  type BusinessProfileBrand,
  type BusinessProfileGeography,
  type BusinessProfileCompetitors,
} from "@openai-harness/connector-business-profile";
import {
  attachCollectedMedia,
  normalizeBusinessProfilePayload,
} from "../utils";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface FetchBusinessProfileArgs {
  section?:
    | "all"
    | "branding"
    | "brand"
    | "geography"
    | "competitors"
    | "keywords"
    | "theme";
}

function formatBrandSection(brand: BusinessProfileBrand, url: string): string {
  let out = `## Brand (${brand.name})\n\n`;
  out += `### Brand Identity\n`;
  out += `- **Brand Name**: ${brand.name}\n`;
  out += `- **Website URL**: ${url}\n`;
  out += `- **Logo URL**: ${brand.logoUrl || "Not defined"}\n\n`;
  out += `### Brand Overview\n${brand.overview}\n\n`;
  return out;
}

function formatGeographySection(geography?: BusinessProfileGeography): string {
  let out = `## Geography & Localization\n\n`;
  if (!geography) return out + `No geography recorded.\n\n`;
  const countries = geography.countries || [];
  if (countries.length === 0) {
    out += `No operating countries recorded.\n\n`;
    return out;
  }
  for (const c of countries) {
    out += `### ${c.name}\n`;
    if (c.regions?.length) {
      out += `- **Regions**: ${c.regions.map((r) => r.name).join(", ")}\n`;
    }
  }
  return out;
}

function formatCompetitorsSection(competitors?: BusinessProfileCompetitors): string {
  let out = `## Direct Competitors\n\n`;
  if (!competitors) return out + `No competitors recorded.\n\n`;
  const list = competitors.competitors || [];
  if (list.length === 0) {
    out += `No direct competitors recorded.\n\n`;
    return out;
  }
  for (const comp of list) {
    out += `### ${comp.name}\n`;
    if (comp.website) out += `- **Website**: ${comp.website}\n`;
    if (comp.overview) out += `- **Overview**: ${comp.overview}\n`;
    const ads = comp.ads || [];
    if (ads.length > 0) {
      out += `- **Recent Ads**: ${ads.length}\n`;
      for (const ad of ads) {
        const media = ad.mediaUrls?.length
          ? ` | media: ${ad.mediaUrls.join(", ")}`
          : "";
        const label = ad.label ? ` | ${ad.label}` : "";
        out += `  - [${ad.format}] ${ad.adUrl}${media}${label}\n`;
      }
    }
  }
  return out;
}

export const fetchBusinessProfileTool = defineTool({
  name: "fetchBusinessProfile",
  description:
    "Fetches the business profile (brand identity, design tokens, geography, competitors).",
  timeoutMs: 15000,
  isConcurrencySafe: () => true,
  parameters: {
    section: {
      type: "string",
      enum: ["all", "branding", "brand", "geography", "competitors"],
      description: "Specific section of the profile to retrieve (default 'all').",
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
    kind: "read",
    title: `Fetch business profile (${args.section || "all"})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "read",
    title: "Business profile fetched",
    content: result.content,
  }),
  async execute(args, exec) {
    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error("User authentication context is required to fetch business profile.");
    }

    const connectorRes = await getConnectorByUserIdAndSlug(userId, "businessProfile");
    if (!connectorRes.success || !connectorRes.data) {
      throw new Error("No Business Profile found. Please configure the brand business profile.");
    }

    const rawMetadata = connectorRes.data.metadata as Partial<BusinessProfileConnectorSchema>;
    const profile = normalizeBusinessProfilePayload(rawMetadata);
    // Show the media the crawl captured, so a profile saved before the
    // lookup existed reads correctly without a rewrite.
    if (profile.competitors) {
      try {
        profile.competitors.competitors = await attachCollectedMedia(
          profile.competitors.competitors,
        );
      } catch {
        // The scraper store is optional here: a profile without it still reads.
      }
    }
    const section = args.section || "all";

    let summary = "";
    if (section === "brand" || section === "branding") {
      summary = formatBrandSection(profile.brand, profile.url);
    } else if (section === "geography") {
      summary = formatGeographySection(profile.geography);
    } else if (section === "competitors") {
      summary = formatCompetitorsSection(profile.competitors);
    } else {
      summary = [
        formatBrandSection(profile.brand, profile.url),
        formatGeographySection(profile.geography),
        formatCompetitorsSection(profile.competitors),
      ].join("\n\n");
    }

    return {
      profile: profile as unknown as Record<string, any>,
      summary,
    };
  },
});
