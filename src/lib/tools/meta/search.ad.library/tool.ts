import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { webSearchTool } from "@/lib/tools/web";
import {
  getDetailBarPage,
  resolveDetailBarSession,
} from "@/lib/detail.bar/service";
import type { CompetitorResearchItem } from "@/lib/detail.bar/types";
import {
  extractAdIdFromReference,
  resolveDateRange,
} from "@/lib/services/utils";
import {
  getAdsByQuery,
  getScrapedAdsByIds,
  ingestScrapedAds,
  buildMetaAdLibraryUrl,
  type ScoredScrapedAd,
} from "@/lib/services/scraper";

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

interface CrawlDepth {
  maxScrollSteps: number;
  scrollDelay: number;
  delayBeforeSnapshot: number;
  pageTimeout: number;
}

/** Requests at or below this count only ask "does this phrase have ads?". */
const VALIDATION_TARGET_COUNT = 2;
/** Validation scans stop after the first cards. */
const VALIDATION_SCROLL_STEPS = 3;

/**
 * Crawl depth from intent, ported from the legacy harness.
 * Validation checks need only the first cards; collection crawls go deeper.
 */
function resolveCrawlDepth(params: {
  targetCount: number;
  query: string;
}): CrawlDepth {
  const targetCount = Math.max(1, params.targetCount);

  if (targetCount <= VALIDATION_TARGET_COUNT) {
    return {
      maxScrollSteps: VALIDATION_SCROLL_STEPS,
      scrollDelay: 1.2,
      delayBeforeSnapshot: 1.2,
      pageTimeout: 45000,
    };
  }

  return {
    maxScrollSteps: 15,
    scrollDelay: 2.5,
    delayBeforeSnapshot: 3.5,
    pageTimeout: 90000,
  };
}

/**
 * Ads delivered since the last committed result, per session.
 *
 * A tool result only lands after the tool returns, so two searches in one step
 * would otherwise both read a log that predates the other. Ids and creative
 * hashes are reserved together: Meta lists the same creative under several ad
 * ids, and reserving hashes stops the duplicate at the source.
 */
interface InFlightReservation {
  ids: Set<string>;
  hashes: Set<string>;
  expiresAt: number;
}

const inFlightAdIds = new Map<string, InFlightReservation>();
const IN_FLIGHT_TTL_MS = 10 * 60 * 1000;

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

/**
 * Builds a uniform, clean telemetry report for the AI agent.
 */
function buildAdLibraryTelemetry(params: {
  query: string;
  country: string;
  dateRange: { startDate: string; endDate: string };
  ads: Array<{
    libraryId: string;
    adUrl: string;
    content: string;
    startDate?: string | null;
  }>;
  excludeCount?: number;
  notice?: string;
}): string {
  const { query, country, dateRange, ads, excludeCount = 0, notice } = params;

  const lines = [
    `### Meta Ad Library Results:`,
    `- **Search Query**: "${query}"`,
    `- **Country**: ${country}`,
    `- **Date Range**: ${dateRange.startDate} to ${dateRange.endDate}`,
    `- **Total Ads Delivered**: ${ads.length}`,
  ];

  if (excludeCount > 0) {
    lines.push(
      `- **Already Analyzed Ads in previous competitor researches (Excluded)**: ${excludeCount}`,
      `- **Context Retrieval**: If you don't have access to or lost context of previously analyzed ads, read them with \`fetchDetailBar\` (field \`competitorResearches\`).`,
    );
  }

  if (notice) {
    lines.push(`\n> [!NOTE]\n> ${notice}`);
  }

  if (ads.length > 0) {
    lines.push(`\n**Top Curated & Verified Ads (Ranked by Relevance)**:\n`);
    ads.forEach((a, idx) => {
      lines.push(
        `#### Ad ${idx + 1} · Library ID ${a.libraryId}\nLink: ${a.adUrl}\n\n${a.content}\n`,
      );
    });
  }

  return lines.join("\n");
}

/** One sentence for "the library had nothing for this window". */
function emptyResult(
  query: string,
  dateRange: { startDate: string; endDate: string },
): ToolOutput<{ contentParts: Array<InputContentParam> }> {
  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `No ads found in Meta Ad Library for "${query}" between ${dateRange.startDate} and ${dateRange.endDate}.`,
        },
      ],
    },
  };
}

export async function executeSearchAdLibraryTool(
  input: ToolInput<SearchAdLibraryArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const query = input.args?.query?.trim();
  const context = input.context;

  if (!query) {
    return failure("The 'query' parameter is required.");
  }

  const targetCount = Math.max(1, input.args?.targetCount ?? 10);
  const defaultCountry = input.args?.country?.trim() || "IN";
  const mediaType = input.args?.mediaType || "all";

  let dateRange: { startDate: string; endDate: string };
  try {
    dateRange = resolveDateRange({
      startDate: input.args?.startDate,
      endDate: input.args?.endDate,
    });
  } catch (err) {
    return failure(err instanceof Error ? err.message : String(err));
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
  for (const r of researches) {
    const ads = [...(r.newAds?.staticAds ?? []), ...(r.newAds?.videoAds ?? [])];
    for (const adRef of ads) {
      const id = extractAdIdFromReference(String(adRef));
      if (id) permanentExcludeIds.add(id);
    }
  }

  const reservation = inFlightReservation(context?.sessionId);
  const excludeIds = new Set([...permanentExcludeIds, ...reservation.ids]);

  // Same creative, different ad id: exclude by content hash too.
  const excludedHashes = new Set<string>(reservation.hashes);
  if (excludeIds.size > 0) {
    const stored = await getScrapedAdsByIds([...excludeIds]);
    for (const rows of stored.values()) {
      for (const row of rows) excludedHashes.add(row.contentHash);
    }
  }

  const allCachedAds = await getAdsByQuery(
    query,
    excludeIds,
    targetCount,
    dateRange,
  );
  const cachedAds = allCachedAds.filter(
    (ad) => !excludedHashes.has(ad.contentHash),
  );

  if (cachedAds.length >= targetCount) {
    const delivered = cachedAds.slice(0, targetCount);
    for (const ad of delivered) {
      reservation.ids.add(ad.libraryId);
      reservation.hashes.add(ad.contentHash);
    }
    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: buildAdLibraryTelemetry({
              query,
              country: defaultCountry,
              dateRange,
              ads: delivered,
              excludeCount: permanentExcludeIds.size,
            }),
          },
        ],
      },
    };
  }

  const shortage = targetCount - cachedAds.length;

  const targetUrl = buildMetaAdLibraryUrl({
    query,
    country: defaultCountry,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    mediaType,
  });

  const depth = resolveCrawlDepth({ targetCount, query });

  interface CrawlResult {
    summary?: string;
    markdown?: string;
    mediaByAnchor?: Array<{
      anchor: string;
      videos: string[];
      images: string[];
    }>;
  }

  const crawl = async (d: CrawlDepth): Promise<CrawlResult> =>
    (await webSearchTool.execute(
      {
        url: targetUrl,
        scanFullPage: true,
        maxScrollSteps: d.maxScrollSteps,
        scrollDelay: d.scrollDelay,
        delayBeforeSnapshot: d.delayBeforeSnapshot,
        pageTimeout: d.pageTimeout,
        mediaAnchorPattern: "Library ID:\\s*(\\d+)",
      },
      {},
    )) as CrawlResult;

  let scrapeRes: CrawlResult | null = null;
  let scrapeError: string | null = null;
  try {
    scrapeRes = await crawl(depth);
  } catch (err: unknown) {
    scrapeError = err instanceof Error ? err.message : String(err);
  }

  if (scrapeRes === null) {
    if (cachedAds.length > 0) {
      for (const ad of cachedAds) {
        reservation.ids.add(ad.libraryId);
        reservation.hashes.add(ad.contentHash);
      }
      return {
        success: true,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: buildAdLibraryTelemetry({
                query,
                country: defaultCountry,
                dateRange,
                ads: cachedAds,
                excludeCount: permanentExcludeIds.size,
                notice:
                  "The live scan was unavailable; these are previously verified ads.",
              }),
            },
          ],
        },
      };
    }

    return failure(
      scrapeError || `Failed to scrape Meta Ad Library for "${query}".`,
    );
  }

  const fullText = scrapeRes.markdown ?? scrapeRes.summary ?? "";

  const isUpstreamMetaError =
    /your request couldn't be processed|sorry!? (?:something went wrong|we're having trouble)|there's an issue and the page could not be loaded/i.test(
      fullText,
    );

  if (
    (isUpstreamMetaError || !fullText.includes("Library ID:")) &&
    cachedAds.length > 0
  ) {
    for (const ad of cachedAds) {
      reservation.ids.add(ad.libraryId);
      reservation.hashes.add(ad.contentHash);
    }
    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: buildAdLibraryTelemetry({
              query,
              country: defaultCountry,
              dateRange,
              ads: cachedAds,
              excludeCount: permanentExcludeIds.size,
              notice: `No additional ads found for this date range in Meta Ad Library. Returning available verified cached ads.`,
            }),
          },
        ],
      },
    };
  }

  if (isUpstreamMetaError || !fullText.includes("Library ID:")) {
    return emptyResult(query, dateRange);
  }

  const ingestResult = await ingestScrapedAds({
    searchQuery: query,
    rawMarkdown: fullText,
    mediaByAnchor: scrapeRes.mediaByAnchor,
    excludeIds,
  });

  const deliveredIds = new Set(cachedAds.map((a) => a.libraryId));
  const freshAccepted: ScoredScrapedAd[] = [];
  for (const ad of ingestResult.relevantAds) {
    if (freshAccepted.length >= shortage) break;
    if (ad.startDate) {
      if (
        ad.startDate < dateRange.startDate ||
        ad.startDate > dateRange.endDate
      ) {
        continue;
      }
    }
    if (excludedHashes.has(ad.contentHash)) continue;
    if (!deliveredIds.has(ad.libraryId) && !excludeIds.has(ad.libraryId)) {
      deliveredIds.add(ad.libraryId);
      freshAccepted.push(ad);
    }
  }

  const finalAds = [...cachedAds, ...freshAccepted];
  if (finalAds.length === 0) return emptyResult(query, dateRange);

  for (const ad of finalAds) {
    reservation.ids.add(ad.libraryId);
    reservation.hashes.add(ad.contentHash);
  }

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: buildAdLibraryTelemetry({
            query,
            country: defaultCountry,
            dateRange,
            ads: finalAds,
            excludeCount: permanentExcludeIds.size,
          }),
        },
      ],
    },
  };
}
