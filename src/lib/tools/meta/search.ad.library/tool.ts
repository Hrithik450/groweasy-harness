/**
 * `searchAdLibrary` — thin tool over the Meta Ad Library pipeline.
 *
 * All orchestration (cache → GraphQL → Crawl4AI → ingest → media storage)
 * lives in `@/lib/meta.ad.library`; this file only maps tool arguments and
 * harness-specific exclusions onto the pipeline and formats the result.
 *
 * Every ad arrives with its media already stored: the card lists a durable
 * `/api/attachments/…` URL that the model copies into `Image`/`Video.src`.
 * Signed CDN URLs never reach the model.
 *
 * @module @/lib/tools/meta/search.ad.library/tool
 */

import { toolFailure as failure } from "@/lib/tools/utils";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  getDetailBarPage,
  resolveDetailBarSession,
} from "@/lib/detail.bar/service";
import type { CompetitorResearchItem } from "@/lib/detail.bar/types";
import { extractAdIdFromReference } from "@/lib/services/utils";
import { getScrapedAdsByIds } from "@/lib/meta.ad.library/ad.scraper";
import {
  MetaAdLibrary,
  fetchMetaAdsViaGraphQL,
  type MetaAdLibrarySearchResult,
} from "@/lib/meta.ad.library";
import { ScraperAdStore } from "@/lib/meta.ad.library/ad.store";
import { AttachmentMediaStore } from "@/lib/meta.ad.library/media.store";
import { Crawl4AIFallback } from "@/lib/meta.ad.library/crawler";

export const searchAdLibraryToolDefinition = {
  type: "function" as const,
  name: "searchAdLibrary",
  description:
    "Searches the Meta Ad Library for fresh competitor creatives, winning hooks, or active campaigns.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Broad keyword phrase, product/service phrase, category or competitor brand name to search or combination of brand name + keywords phrases. (e.g. 'WhatsApp automation', 'Pabbly whatsapp').",
      },
      targetCount: {
        type: "number",
        description: "Number of fresh winning ads needed (default: 10).",
      },
      startDate: {
        type: "string",
        description:
          "Start date filter for ad launch window in 'YYYY-MM-DD' format (e.g. '2026-03-01'). Defaults to 30 days prior to endDate if omitted.",
      },
      endDate: {
        type: "string",
        description:
          "End date filter for ad launch window in 'YYYY-MM-DD' format (e.g. '2026-04-15'). Defaults to today if omitted.",
      },
      country: {
        type: "string",
        description:
          "2-letter ISO country code (e.g. 'IN', 'US', 'GB') or 'ALL' (default: 'IN').",
      },
      mediaType: {
        type: "string",
        enum: ["all", "image", "video"],
        description: "Creative format: 'all' (default), 'image', or 'video'.",
      },
    },
    required: ["query"],
  },
};

export interface SearchAdLibraryArgs {
  query: string;
  country?: string;
  targetCount?: number;
  startDate?: string;
  endDate?: string;
  mediaType?: "all" | "image" | "video";
}

const metaAdLibrary = new MetaAdLibrary({
  store: new ScraperAdStore(),
  media: new AttachmentMediaStore(),
  crawler: new Crawl4AIFallback(),
  graphql: fetchMetaAdsViaGraphQL,
});

/**
 * Ads delivered since the last committed result, per session.
 *
 * Ids and creative hashes are reserved together: Meta lists the same creative
 * under several ad ids, and reserving hashes stops the duplicate at the source.
 */
interface InFlightReservation {
  ids: Set<string>;
  hashes: Set<string>;
  expiresAt: number;
}

const IN_FLIGHT_TTL_MS = 10 * 60 * 1000;
const inFlightAdIds = new Map<string, InFlightReservation>();

function inFlightReservation(
  sessionId?: string,
  now = Date.now(),
): InFlightReservation {
  if (!sessionId) {
    return { ids: new Set(), hashes: new Set(), expiresAt: now };
  }
  const entry = inFlightAdIds.get(sessionId);
  if (entry !== undefined && entry.expiresAt > now) return entry;

  if (inFlightAdIds.size >= 100) {
    for (const [key, value] of inFlightAdIds) {
      if (value.expiresAt <= now) inFlightAdIds.delete(key);
    }
  }

  const reservation: InFlightReservation = {
    ids: new Set(),
    hashes: new Set(),
    expiresAt: now + IN_FLIGHT_TTL_MS,
  };
  inFlightAdIds.set(sessionId, reservation);
  return reservation;
}

/** One sentence for "the library had nothing for this window". */
function emptyResult(
  query: string,
  result: MetaAdLibrarySearchResult,
): ToolOutput<{ contentParts: Array<InputContentParam> }> {
  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `No ads found in Meta Ad Library for "${query}" between ${result.startDate} and ${result.endDate}.`,
        },
      ],
    },
  };
}

/** Uniform telemetry for the model. */
function formatResult(
  result: MetaAdLibrarySearchResult,
  excludeCount: number,
): string {
  const lines = [
    `### Meta Ad Library Results:`,
    `- **Search Query**: "${result.query}"`,
    `- **Country**: ${result.country}`,
    `- **Date Range**: ${result.startDate} to ${result.endDate}`,
    `- **Total Ads Delivered**: ${result.ads.length}`,
  ];

  if (excludeCount > 0) {
    lines.push(
      `- **Already Analyzed Ads in previous competitor researches (Excluded)**: ${excludeCount}`,
      `- **Context Retrieval**: If you don't have access to or lost context of previously analyzed ads, read them with \`fetchDetailBar\` (field \`competitorResearches\`).`,
    );
  }

  if (result.notice) {
    lines.push(`\n> [!NOTE]\n> ${result.notice}`);
  }

  if (result.ads.length > 0) {
    lines.push(
      ``,
      `**Media rule**: every ad lists its durable Media URL below. Copy it exactly into that ad's \`Video\`/\`Image\` \`src\`. Never write facebook.com, fbcdn.net, or any other external media URL — media with no Media line is unavailable.`,
      ``,
      `**Top Curated & Verified Ads (Ranked by Relevance)**:`,
      ``,
    );
    result.ads.forEach((ad, index) => {
      lines.push(`#### Ad ${index + 1} · Library ID ${ad.libraryId}`);
      lines.push(`Link: ${ad.adUrl}`);
      for (const media of ad.media) {
        lines.push(`Media: ${media.kind} — ${media.url}`);
      }
      lines.push(``, ad.content, ``);
    });
  }

  return lines.join("\n");
}

export async function executeSearchAdLibraryTool(
  input: ToolInput<SearchAdLibraryArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const query = input.args?.query?.trim();
  if (!query) {
    return failure("The 'query' parameter is required.");
  }

  // Every researched ad id is excluded, whichever brand it came from.
  const session = input.context?.userId
    ? resolveDetailBarSession(input.context.userId, "competitorResearches")
    : null;
  const researches = session
    ? (getDetailBarPage(session.id, "competitorResearches")
        .items as unknown as CompetitorResearchItem[])
    : [];

  const permanentExcludeIds = new Set<string>();
  for (const research of researches) {
    const ads = [
      ...(research.newAds?.staticAds ?? []),
      ...(research.newAds?.videoAds ?? []),
    ];
    for (const adRef of ads) {
      const id = extractAdIdFromReference(String(adRef));
      if (id) permanentExcludeIds.add(id);
    }
  }

  const reservation = inFlightReservation(input.context?.sessionId);
  const excludeIds = new Set([...permanentExcludeIds, ...reservation.ids]);

  // Same creative, different ad id: exclude by content hash too.
  const excludeHashes = new Set<string>(reservation.hashes);
  if (excludeIds.size > 0) {
    const stored = getScrapedAdsByIds([...excludeIds]);
    for (const row of stored.values()) excludeHashes.add(row.contentHash);
  }

  let result: MetaAdLibrarySearchResult;
  try {
    result = await metaAdLibrary.search({
      query,
      country: input.args?.country?.trim() || "IN",
      targetCount: input.args?.targetCount ?? 10,
      startDate: input.args?.startDate,
      endDate: input.args?.endDate,
      mediaType: input.args?.mediaType ?? "all",
      excludeIds,
      excludeHashes,
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }

  if (result.ads.length === 0) {
    return emptyResult(query, result);
  }

  for (const ad of result.ads) {
    reservation.ids.add(ad.libraryId);
    if (ad.contentHash) reservation.hashes.add(ad.contentHash);
  }

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: formatResult(result, permanentExcludeIds.size),
        },
      ],
    },
  };
}
