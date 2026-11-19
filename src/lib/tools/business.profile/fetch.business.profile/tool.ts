import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { getConnectorByUserIdAndSlug } from "@/lib/services/connectors.service";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  parseFlatLocations,
  type BusinessProfileConnectorSchema,
  type BusinessProfileBrand,
  type BusinessProfileGeography,
  type BusinessProfileCompetitors,
} from "@/lib/connectors/business.profile";
import { normalizeBusinessProfilePayload } from "../utils";

export const fetchBusinessProfileToolDefinition = {
  type: "function" as const,
  name: "fetchBusinessProfile",
  description:
    "Fetches the authenticated user's complete Business Profile matching the Business Profile modal architecture (Branding, Geography, and Competitors), including design tokens, keywords, location hierarchy, and competitor overviews.",
  parameters: {
    type: "object",
    properties: {
      section: {
        type: "string",
        enum: ["all", "branding", "brand", "geography", "competitors"],
        description:
          "Specific modal tab/section of the business profile to retrieve ('all', 'branding', 'geography', 'competitors'). Defaults to 'all'.",
      },
    },
  },
};

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

export interface FetchBusinessProfileResult {
  contentParts: Array<InputContentParam>;
  profile?: BusinessProfileConnectorSchema;
}

function formatBrandSection(brand: BusinessProfileBrand, url: string): string {
  let out = `## Brand (${brand.name})\n\n`;
  out += `### Brand Identity\n`;
  out += `- **Brand Name**: ${brand.name}\n`;
  out += `- **Website**: ${url}\n`;
  if (brand.logoUrl) {
    out += `- **Logo URL**: ${brand.logoUrl}\n`;
  }

  out += `\n### Overview\n${brand.overview || "No brand overview recorded."}\n\n`;

  const broad = brand.keywords?.broadPhrases || [];
  const product = brand.keywords?.productOrServicePhrases || [];
  out += `### Search Keywords & Phrases\n`;
  out += `- **Broad / Category Keywords** (${broad.length}): ${broad.length ? broad.join(", ") : "None recorded"}\n`;
  out += `- **Product & Service Phrases** (${product.length}): ${product.length ? product.join(", ") : "None recorded"}\n\n`;

  const theme = brand.theme;
  out += `### Color System & Palette\n`;
  out += `- **Primary Color**: ${theme?.primary || "N/A"} (Dominant brand tone)\n`;
  out += `- **Primary Accent**: ${theme?.primaryAccent || "N/A"} (CTA & highlight)\n`;
  if (theme?.otherAccents?.length) {
    out += `- **Other Accents**: ${theme.otherAccents.join(", ")}\n`;
  }
  if (theme?.secondary) {
    out += `- **Secondary Color**: ${theme.secondary} (Supporting element)\n`;
  }
  if (theme?.background) {
    out += `- **Background Color**: ${theme.background} (Surface & canvas base)\n`;
  }
  if (theme?.foreground) {
    out += `- **Foreground Color**: ${theme.foreground} (Typography & high-contrast content)\n`;
  }

  out += `\n### Typography & Geometry\n`;
  out += `- **Font Families**: ${brand.fontNames?.length ? brand.fontNames.join(", ") : "Modern Sans-Serif"}\n`;
  if (brand.fontUrls?.length) {
    out += `- **Web Font URLs**: ${brand.fontUrls.join(", ")}\n`;
  }
  out += `- **Corner Radius**: ${theme?.radius || "0.75rem (Rounded)"}\n`;

  return out.trim();
}

function formatGeographySection(
  geography: BusinessProfileGeography | undefined,
  brandName: string,
): string {
  let out = `## Geography (${brandName})\n\n`;
  out += `- **Scope**: ${geography?.scope || "nationwide"}\n`;
  const countries = geography?.countries || [];
  const countryNames = countries.map((c) => c.name).filter(Boolean);
  out += `- **Operating Countries**: ${countryNames.length ? countryNames.join(", ") : "None recorded"}\n`;
  const languages = geography?.languages || [];
  out += `- **Target Languages**: ${languages.length ? languages.join(", ") : "English"}\n\n`;

  const flatLocations = parseFlatLocations(countries);
  out += `### Target Locations & Hierarchy (${flatLocations.length} configured)\n`;
  if (flatLocations.length > 0) {
    flatLocations.forEach((loc) => {
      const areaPart =
        loc.area && loc.area !== "All Areas" ? ` > ${loc.area}` : "";
      const radiusPart = loc.radiusKm ? ` (${loc.radiusKm} km radius)` : "";
      out += `- ${loc.country} > ${loc.region} > ${loc.city}${areaPart}${radiusPart}\n`;
    });
  } else if (countryNames.length > 0) {
    out += `- Nationwide coverage across ${countryNames.join(", ")} (no sub-regional boundaries configured).\n`;
  } else {
    out += `- No target locations configured.\n`;
  }

  return out.trim();
}

function formatCompetitorsSection(
  competitorsData: BusinessProfileCompetitors | undefined,
  brandName: string,
): string {
  const list = competitorsData?.competitors || [];
  let out = `## Competitors (${brandName})\n\n`;
  out += `**Total Tracked Competitors**: ${list.length} ${list.length === 1 ? "Competitor" : "Competitors"}\n\n`;

  if (list.length === 0) {
    out += `No competitors recorded yet.\n`;
    return out.trim();
  }

  list.forEach((c, idx) => {
    out += `### Competitor #${idx + 1}: ${c.name}\n`;
    if (c.website) out += `- **Website**: ${c.website}\n`;
    if (c.logo) out += `- **Logo URL**: ${c.logo}\n`;
    out += `- **Overview**: ${c.overview || "No competitor overview provided."}\n`;
    const broad = c.keywords?.broadPhrases || [];
    const product = c.keywords?.productOrServicePhrases || [];
    out += `- **Search Keywords & Phrases**:\n`;
    out += `  - **Broad / Category Keywords** (${broad.length}): ${broad.length ? broad.join(", ") : "None recorded"}\n`;
    out += `  - **Product & Service Phrases** (${product.length}): ${product.length ? product.join(", ") : "None recorded"}\n\n`;
  });

  return out.trim();
}

function formatBusinessProfileText(
  profile: BusinessProfileConnectorSchema,
  section: string = "all",
): string {
  const { brand, geography, competitors, url } = profile;
  const s = section.toLowerCase().trim();

  if (s === "brand") {
    return formatBrandSection(brand, url);
  }

  if (s === "geography") {
    return formatGeographySection(geography, brand.name);
  }

  if (s === "competitors") {
    return formatCompetitorsSection(competitors, brand.name);
  }

  let out = `# Business Profile: ${brand.name}\n\n`;
  out += `\n---\n\n`;
  out += formatBrandSection(brand, url);
  out += `\n\n---\n\n`;
  out += formatGeographySection(geography, brand.name);
  out += `\n\n---\n\n`;
  out += formatCompetitorsSection(competitors, brand.name);

  return out;
}

export async function executeFetchBusinessProfileTool(
  input: ToolInput<FetchBusinessProfileArgs>,
): Promise<ToolOutput<FetchBusinessProfileResult>> {
  const userId = input.context?.userId;
  if (!userId) {
    const errorMsg =
      "User authentication context required to fetch Business Profile.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  try {
    const connectorRes = await getConnectorByUserIdAndSlug(
      userId,
      "businessProfile",
    );
    const connector = connectorRes?.data;

    if (!connector || connector.status !== "connected" || !connector.metadata) {
      const errorMsg =
        "No active Business Profile found. The Business Profile connector is currently disconnected or has not analyzed a brand website yet.";
      return {
        success: false,
        data: {
          contentParts: [{ type: "input_text", text: errorMsg }],
        },
        error: errorMsg,
      };
    }

    const profile = normalizeBusinessProfilePayload(
      connector.metadata,
      (connector.metadata as { url?: string })?.url,
    );

    const section = input.args?.section ?? "all";
    const formattedText = formatBusinessProfileText(profile, section);

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: formattedText,
          },
        ],
        profile,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Failed to fetch Business Profile: ${errorMsg}`,
          },
        ],
      },
      error: errorMsg,
    };
  }
}
