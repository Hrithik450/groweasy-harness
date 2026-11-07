import type { Session } from "@openai-harness/session";
import { alternateWebSearchTool, resolveCrawlAbortMs } from "@openai-harness/tool-web";
import { getConnectorByUserIdAndSlug } from "@openai-harness/connector";
import { getCompetitorResearches } from "../competitor-research/history";
import {
  resolveDateRange,
  normalizeDomainOrUrl,
  extractAdIdFromReference,
} from "@openai-harness/scraper";
import {
  crispAdCardContent,
  getAdsByQuery,
  getAdsBySemanticQuery,
  getScrapedAdsByIds,
  ingestScrapedAds,
  buildMetaAdLibraryUrl,
  parseMetaAdCards,
  stripExpiredMediaLines,
  type ScoredScrapedAd,
} from "@openai-harness/scraper";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";
import { deliveredAdIds, pickUniqueAds } from "./delivered";

export interface SearchAdLibraryArgs {
  query: string;
  country?: string;
  targetCount?: number;
  startDate?: string;
  endDate?: string;
  mediaType?: "all" | "image" | "video";
}

interface AlternateScrapeMedia {
  videos: string[];
  images: string[];
}

interface AlternateScrapeResult {
  summary?: string;
  markdown?: string;
  media?: AlternateScrapeMedia;
  mediaByAnchor?: Array<{ anchor: string; videos: string[]; images: string[] }>;
}

export interface CrawlDepth {
  maxScrollSteps: number;
  scrollDelay: number;
  delayBeforeSnapshot: number;
  pageTimeout: number;
}

/** Requests at or below this count only ask "does this phrase have ads?". */
const VALIDATION_TARGET_COUNT = 2;

/**
 * Wall-clock ceiling for one search, hung or healthy.
 *
 * Measured worst cases: a 15-step collection crawl takes ~51s, a three-step
 * probe ~8-19s, and embeddings ingest ~15s — a full two-pass search finishes
 * near 80s. Three minutes therefore leaves roughly 2x headroom while still
 * bounding a stuck crawl to the same order of magnitude as a healthy one.
 */
export const SEARCH_AD_LIBRARY_TIMEOUT_MS = 180_000;

/**
 * Navigation budget for a collection crawl.
 *
 * The per-crawl abort budget becomes pageTimeout + scroll pauses + snapshot
 * delay + 30s, so 90s keeps one deep crawl at ~161s — inside the search's own
 * ceiling. Measured navigation on the Ad Library is ~13s at the deepest scan.
 */
const COLLECTION_PAGE_TIMEOUT_MS = 90_000;

/** Time kept back from the ceiling for parsing, ingest, and the reply. */
const INGEST_RESERVE_MS = 30_000;

/**
 * Picks crawl depth from the request's intent.
 *
 * Validation requests (business-profile keyword checks) need only the first ad
 * cards, which Meta renders before any scrolling, so a shallow scan answers
 * them in a fraction of a full crawl. Collection requests keep the deeper scan
 * that supplies enough fresh creatives.
 */
export function resolveCrawlDepth(params: {
  targetCount?: number;
  query: string;
}): CrawlDepth {
  const targetCount = Math.max(1, params.targetCount ?? 10);

  if (targetCount <= VALIDATION_TARGET_COUNT) {
    return {
      maxScrollSteps: 3,
      scrollDelay: 1.2,
      delayBeforeSnapshot: 1.2,
      pageTimeout: 45000,
    };
  }

  const isSpecificBrandQuery = /^[A-Z][a-zA-Z0-9\s]{2,}$/.test(params.query);
  return {
    maxScrollSteps: isSpecificBrandQuery ? 10 : 15,
    scrollDelay: 2.5,
    delayBeforeSnapshot: 3.5,
    pageTimeout: COLLECTION_PAGE_TIMEOUT_MS,
  };
}

/**
 * Scroll steps in the cheap first pass of a collection crawl.
 *
 * Meta renders a full result page before the first scroll and appends more
 * cards as the feed advances, so three steps usually surface far more cards
 * than a single search needs. The deeper pass runs only when this one falls
 * short.
 */
export const AD_LIBRARY_PROBE_SCROLL_STEPS = 3;

/**
 * Shallow depth used for the first pass of a collection crawl.
 *
 * Validation crawls already stop at or below the probe depth and are returned
 * unchanged, so they still make exactly one request.
 *
 * @param depth - full crawl depth for the request.
 */
export function resolveProbeDepth(depth: CrawlDepth): CrawlDepth {
  if (depth.maxScrollSteps <= AD_LIBRARY_PROBE_SCROLL_STEPS) return depth;
  return { ...depth, maxScrollSteps: AD_LIBRARY_PROBE_SCROLL_STEPS };
}

/**
 * Count unique ad cards in a page whose launch date falls inside the window.
 *
 * The Ad Library URL already applies the date filter, but the rendered feed
 * can include a stray card outside it (and cards whose date line did not
 * parse). Unknown dates count as in-window: they cannot be ruled out, and a
 * false negative would trigger an unnecessary second crawl.
 *
 * @param markdown - raw crawler markdown for one page.
 * @param dateRange - inclusive `YYYY-MM-DD` window.
 * @param excludeIds - ids already analyzed or delivered in this session.
 */
export function countAdsInWindow(
  markdown: string,
  dateRange: { startDate: string; endDate: string },
  excludeIds: ReadonlySet<string> = new Set(),
): number {
  return parseMetaAdCards(markdown).filter((card) => {
    if (excludeIds.has(card.libraryId)) return false;
    if (card.startDate === null) return true;
    return (
      card.startDate >= dateRange.startDate &&
      card.startDate <= dateRange.endDate
    );
  }).length;
}

/** Union two page-level media lists, preserving first-seen order. */
function mergeMedia(
  first: AlternateScrapeMedia | undefined,
  second: AlternateScrapeMedia | undefined,
): AlternateScrapeMedia | undefined {
  if (!first) return second;
  if (!second) return first;
  return {
    videos: [...new Set([...first.videos, ...second.videos])],
    images: [...new Set([...first.images, ...second.images])],
  };
}

/** Union per-anchor media from two crawls of the same feed. */
function mergeAnchoredMedia(
  first: AlternateScrapeResult["mediaByAnchor"],
  second: AlternateScrapeResult["mediaByAnchor"],
): AlternateScrapeResult["mediaByAnchor"] {
  if (!first) return second;
  if (!second) return first;

  const merged = new Map(
    first.map((group) => [
      group.anchor,
      { videos: [...group.videos], images: [...group.images] },
    ]),
  );
  for (const group of second) {
    const existing = merged.get(group.anchor);
    if (!existing) {
      merged.set(group.anchor, {
        videos: [...group.videos],
        images: [...group.images],
      });
      continue;
    }
    existing.videos = [...new Set([...existing.videos, ...group.videos])];
    existing.images = [...new Set([...existing.images, ...group.images])];
  }
  return Array.from(merged, ([anchor, group]) => ({
    anchor,
    videos: group.videos,
    images: group.images,
  }));
}

/** Per-session reservations, dropped after {@link IN_FLIGHT_TTL_MS}. */
interface InFlightReservation {
  ids: Set<string>;
  /** Creative hashes reserved in this selection window (cross-tier dedupe). */
  hashes: Set<string>;
  expiresAt: number;
}

const inFlightAdIds = new Map<string, InFlightReservation>();
const IN_FLIGHT_TTL_MS = 10 * 60 * 1000;

/**
 * Ids delivered since the last result committed, per session.
 *
 * A `tool/result` only lands after the tool returns, so two searches issued in
 * one step both read a log that predates the other's delivery. This set closes
 * that window; the durable scan in `deliveredAdIds` covers everything older.
 * Expired entries carry no information the log does not already hold.
 */
function inFlightReservation(
  sessionId: string,
  now = Date.now(),
): InFlightReservation {
  const entry = inFlightAdIds.get(sessionId);
  if (entry !== undefined && entry.expiresAt > now) return entry;

  if (inFlightAdIds.size >= 100) {
    for (const [key, value] of inFlightAdIds) {
      if (value.expiresAt <= now) inFlightAdIds.delete(key);
    }
  }

  const reservation: InFlightReservation = {
    ids: new Set<string>(),
    hashes: new Set<string>(),
    expiresAt: now + IN_FLIGHT_TTL_MS,
  };
  inFlightAdIds.set(sessionId, reservation);
  return reservation;
}

const MEDIA_LINE_RE = /^(?:Video|Image):\s+https?:\/\/\S+$/i;
const PAGE_MEDIA_LIMIT = 40;

/**
 * Creative URLs rendered per ad.
 *
 * Carousel ads reach the model with 50+ signed CDN URLs, each a few hundred
 * characters. The first few identify the creative; the rest is payload the
 * model never reads, so the count is capped and the remainder summarized.
 */
const MEDIA_LINES_PER_AD = 8;

/**
 * Body characters rendered per ad.
 *
 * The stored card keeps the full text; the model payload keeps enough to read
 * the hook, offer, and CTA of an unusually long card.
 */
const AD_BODY_LIMIT = 4000;

function extractMediaLines(content: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of content.split("\n").map((raw) => raw.trim())) {
    if (!MEDIA_LINE_RE.test(line)) continue;
    // A carousel can repeat the same URL per slide; say it once.
    const url = line.slice(line.indexOf("http"));
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(line);
  }
  return result;
}

/**
 * Whether a cached card still carries at least one usable creative URL.
 *
 * Meta signs its CDN links with an `oe=` expiry that passes within days, so a
 * card cached last week leads the model to dead media. Cards with no media at
 * all (text-only ads) are always deliverable; a card whose every link expired
 * is treated as stale so the caller crawls instead of serving it.
 */
export function hasLiveMedia(content: string, now = Date.now()): boolean {
  const crisp = crispAdCardContent(content);
  const total = extractMediaLines(crisp).length;
  if (total === 0) return true;
  return total - stripExpiredMediaLines(crisp, now).dropped > 0;
}

/** Cut over-long card text at a line boundary so the payload stays readable. */
function clipAdBody(body: string): string {
  if (body.length <= AD_BODY_LIMIT) return body;
  const cut = body.lastIndexOf("\n", AD_BODY_LIMIT);
  return `${body.slice(0, cut > 0 ? cut : AD_BODY_LIMIT).trimEnd()}\n…(card text truncated)`;
}

function stripMediaLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => !MEDIA_LINE_RE.test(line.trim()))
    .join("\n")
    .trim();
}

export function buildAdLibraryTelemetry(params: {
  query: string;
  country: string;
  dateRange: { startDate: string; endDate: string };
  ads: ScoredScrapedAd[];
  excludeCount?: number;
  sessionExcludeCount?: number;
  /** Ads reused from related cached searches rather than a fresh scrape. */
  semanticCount?: number;
  notices?: string[];
  pageMedia?: { videos: string[]; images: string[] };
  /** Clock injection for the media-expiry scrub. */
  now?: number;
}): string {
  const {
    query,
    country,
    dateRange,
    ads,
    excludeCount = 0,
    sessionExcludeCount = 0,
    semanticCount = 0,
    notices = [],
    pageMedia,
    now = Date.now(),
  } = params;

  const lines = [
    `### Meta Ad Library Results:`,
    `- **Search Query**: "${query}"`,
    `- **Country**: ${country}`,
    `- **Date Range**: ${dateRange.startDate} to ${dateRange.endDate}`,
    `- **Total Ads Delivered**: ${ads.length}`,
  ];

  if (semanticCount > 0) {
    lines.push(
      `- **Matched from related cached searches (semantic cache)**: ${semanticCount}`,
      `- **Semantic Cache**: these ads were reused from related cached searches, so no fresh scrape was needed for them.`,
    );
  }

  if (excludeCount > 0) {
    lines.push(
      `- **Already Analyzed Ads in previous competitor researches (Excluded)**: ${excludeCount}`,
      `- **Context Retrieval**: If you don't have access to or lost context of previously analyzed ads, use the \`fetchCompetitorResearches\` tool to retrieve them.`,
    );
  }

  if (sessionExcludeCount > 0) {
    lines.push(
      `- **Already Delivered in this session (Excluded)**: ${sessionExcludeCount}`,
    );
  }

  for (const notice of notices) {
    lines.push(`\n> [!NOTE]\n> ${notice}`);
  }

  let expiredMedia = 0;
  if (ads.length > 0) {
    lines.push(`\n**Top Curated & Verified Ads (Ranked by Relevance)**:\n`);
    ads.forEach((a, idx) => {
      // Cached cards were captured at crawl time: re-crisp them for display
      // and drop media whose signed CDN expiry has passed since.
      const { content, dropped } = stripExpiredMediaLines(
        crispAdCardContent(a.content),
        now,
      );
      expiredMedia += dropped;

      const mediaLines = extractMediaLines(content);
      const body = clipAdBody(stripMediaLines(content));
      // The creative copy leads the card; media URLs follow it. A carousel's
      // dozens of URLs must never bury the hook the model is reading for.
      const shown = mediaLines.slice(0, MEDIA_LINES_PER_AD);
      if (mediaLines.length > shown.length) {
        shown.push(
          `…and ${mediaLines.length - shown.length} more creative URLs`,
        );
      }
      const mediaBlock = shown.length > 0 ? `\n\n${shown.join("\n")}` : "";
      lines.push(
        `#### Ad ${idx + 1}, Library ID: ${a.libraryId}\nLink: ${a.adUrl}\n\n${body}${mediaBlock}\n`,
      );
    });
  }

  if (expiredMedia > 0) {
    lines.push(
      `\n> [!NOTE]\n> ${expiredMedia} media link${expiredMedia === 1 ? "" : "s"} in these ads expired and ${expiredMedia === 1 ? "was" : "were"} removed. Run the same search again to refresh ${expiredMedia === 1 ? "it" : "them"}.`,
    );
  }

  if (pageMedia && pageMedia.videos.length > 0) {
    const videos = pageMedia.videos.slice(0, PAGE_MEDIA_LIMIT);
    lines.push(
      `\n**Video creatives found on the page (not linked to a specific ad)**:\n`,
      ...videos.map((src) => `- ${src}`),
    );
    if (pageMedia.videos.length > PAGE_MEDIA_LIMIT) {
      lines.push(
        `- ...and ${pageMedia.videos.length - PAGE_MEDIA_LIMIT} more video URLs`,
      );
    }
  }

  return lines.join("\n");
}

export const searchAdLibraryTool = defineTool({
  name: "searchAdLibrary",
  description:
    "Searches the Meta Ad Library for fresh competitor creatives, winning hooks, and active campaigns.",
  timeoutMs: SEARCH_AD_LIBRARY_TIMEOUT_MS,
  isConcurrencySafe: () => true,
  parameters: {
    query: {
      type: "string",
      required: true,
      description:
        "Broad keyword phrase, product/service phrase, category or competitor brand name to search for (e.g. 'WhatsApp automation', 'Pabbly').",
    },
    targetCount: {
      type: "number",
      description: "Number of fresh winning ads needed (default: 10).",
    },
    startDate: {
      type: "string",
      description:
        "Start date filter for ad launch window in 'YYYY-MM-DD' format (e.g. '2026-03-01').",
    },
    endDate: {
      type: "string",
      description:
        "End date filter for ad launch window in 'YYYY-MM-DD' format (e.g. '2026-04-15').",
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
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        totalAds: { type: "number", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ totalAds: value.totalAds }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "search",
    title: `Search Meta Ad Library: "${args.query}" (${args.country || "IN"})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "search",
    title: `Meta Ad Library: ${
      (result.meta as { totalAds?: number } | undefined)?.totalAds ?? 0
    } ads found`,
    content: result.content,
  }),
  async execute(args, exec) {
    // The ceiling is enforced by the registry; the same number is also this
    // search's own budget, so a second crawl is only started when it fits.
    const startedAt = Date.now();

    const query = args.query?.trim();
    if (!query) {
      throw new Error("The 'query' parameter is required.");
    }

    const targetCount = Math.max(1, args.targetCount ?? 10);
    const country = (args.country?.trim() || "IN").toUpperCase();
    const mediaType = args.mediaType || "all";

    const dateRange = resolveDateRange({
      startDate: args.startDate,
      endDate: args.endDate,
    });

    const session = toolSession<Session>(exec);
    const previouslyAnalyzedAdIds = new Set<string>();

    if (session.userId) {
      try {
        // Saved researches are stamped with the business profile's URL, so the
        // brand scope must come from the same connector. The Meta connector
        // carries ad-account metadata and no brand URL at all; reading it there
        // left every previously analyzed ad unexcluded.
        const brandConnector = await getConnectorByUserIdAndSlug(
          session.userId,
          "businessProfile",
        );
        const brandMetadata = ((brandConnector?.data?.metadata as Record<
          string,
          unknown
        >) || {}) as { url?: string };
        const brandUrl = brandMetadata.url?.trim();

        // An unknown brand scope still excludes the user's whole research
        // history: it is better to repeat no ads than to miss an exclusion.
        const historyItems = await getCompetitorResearches(
          session.userId,
          brandUrl ? normalizeDomainOrUrl(brandUrl) : undefined,
        );

        for (const item of historyItems) {
          const allRefs = [
            ...(item.newAds?.staticAds || []),
            ...(item.newAds?.videoAds || []),
          ];
          for (const ref of allRefs) {
            const id = extractAdIdFromReference(ref);
            if (id) previouslyAnalyzedAdIds.add(id);
          }
        }
      } catch (err) {
        console.warn(
          "[searchAdLibrary] Failed to retrieve previously analyzed ads:",
          err,
        );
      }
    }

    // Durable half of the exclusion: every ad this session's log already
    // shows the model. The in-flight half is reserved at selection time.
    const sessionDelivered = deliveredAdIds(session.events);

    // Creatives, not just ids, are excluded: Meta lists the same creative
    // under several library ids, and the exact and semantic tiers can each
    // surface one of them. Resolving the excluded ids to their stored hashes
    // keeps that creative from appearing twice in one answer.
    const excludedHashes = new Set<string>();
    try {
      const idsToResolve = new Set([
        ...sessionDelivered,
        ...previouslyAnalyzedAdIds,
      ]);
      if (idsToResolve.size > 0) {
        const resolved = await getScrapedAdsByIds([...idsToResolve]);
        if (resolved.success && resolved.data) {
          for (const rows of resolved.data.values()) {
            for (const row of rows) excludedHashes.add(row.contentHash);
          }
        }
      }
    } catch (err) {
      console.warn(
        "[searchAdLibrary] Failed to resolve delivered creative hashes:",
        err,
      );
    }

    const blocked = (): Set<string> => {
      const reservation = inFlightReservation(session.id);
      return new Set([
        ...previouslyAnalyzedAdIds,
        ...sessionDelivered,
        ...reservation.ids,
      ]);
    };

    const blockedHashes = (): Set<string> => {
      const reservation = inFlightReservation(session.id);
      return new Set([...excludedHashes, ...reservation.hashes]);
    };

    // Select and reserve in one synchronous step: there is no await between
    // reading the exclusion and writing the reservation, so two searches
    // issued in the same step run this atomically and the second one sees the
    // first one's ads instead of handing the same ads out twice.
    const deliver = (
      pool: readonly ScoredScrapedAd[],
      count: number,
    ): ScoredScrapedAd[] => {
      const taken = pickUniqueAds(pool, blocked(), count, blockedHashes());
      const reserved = inFlightReservation(session.id);
      for (const ad of taken) {
        reserved.ids.add(ad.libraryId);
        reserved.hashes.add(ad.contentHash);
      }
      return taken;
    };

    const shortfallNotice = (delivered: number): string | undefined =>
      delivered < targetCount
        ? `Only ${delivered} new ad${delivered === 1 ? "" : "s"} matched this query. Ads already delivered in this session are never repeated, so searching the same query again returns nothing new — widen the date range or use a different keyword.`
        : undefined;

    // Over-fetch: one creative can be listed under several library ids, and
    // the picker collapses those, so a pool sized exactly to the target would
    // under-deliver.
    const storedAdsRes = await getAdsByQuery(
      query,
      blocked(),
      targetCount * 5,
      { startDate: dateRange.startDate, endDate: dateRange.endDate },
    );
    const now = Date.now();
    const storedPool = (
      storedAdsRes.success && storedAdsRes.data ? storedAdsRes.data : []
    ).filter((ad) => hasLiveMedia(ad.content, now));
    const exactAds = deliver(storedPool, targetCount);

    // Second cache tier: an earlier crawl under a related phrase may already
    // have stored an ad that answers this query. The query embedding is only
    // paid here, when the exact cache is short — never on the scrape path.
    let semanticAds: ScoredScrapedAd[] = [];
    if (exactAds.length < targetCount) {
      const semanticRes = await getAdsBySemanticQuery(
        query,
        blocked(),
        targetCount - exactAds.length,
        { startDate: dateRange.startDate, endDate: dateRange.endDate },
      );
      const semanticPool = (
        semanticRes.success && semanticRes.data ? semanticRes.data : []
      ).filter((ad) => hasLiveMedia(ad.content, now));
      // `deliver` re-reads the blocked set, which now holds the exact matches'
      // in-flight reservations, so one libraryId cannot be handed out twice.
      semanticAds = deliver(semanticPool, targetCount - exactAds.length);
    }

    // Result order: exact matches, then semantic matches, then fresh scrapes.
    const cachedAds = [...exactAds, ...semanticAds];
    const semanticCount = semanticAds.length;

    if (cachedAds.length >= targetCount) {
      const summary = buildAdLibraryTelemetry({
        query,
        country,
        dateRange,
        ads: cachedAds,
        excludeCount: previouslyAnalyzedAdIds.size,
        sessionExcludeCount: sessionDelivered.size,
        semanticCount,
      });

      return {
        totalAds: cachedAds.length,
        summary,
      };
    }

    const searchUrl = buildMetaAdLibraryUrl({
      query,
      country,
      mediaType,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });

    const depth = resolveCrawlDepth({ targetCount, query });
    const probeDepth = resolveProbeDepth(depth);

    const crawl = async (
      crawlDepth: CrawlDepth,
    ): Promise<AlternateScrapeResult> =>
      (await alternateWebSearchTool.execute(
        {
          url: searchUrl,
          scanFullPage: true,
          maxScrollSteps: crawlDepth.maxScrollSteps,
          scrollDelay: crawlDepth.scrollDelay,
          delayBeforeSnapshot: crawlDepth.delayBeforeSnapshot,
          pageTimeout: crawlDepth.pageTimeout,
          // Group crawler media under the nearest "Library ID: <id>" in the
          // page HTML so each video is attached to the correct ad card.
          mediaAnchorPattern: "Library ID:\\s*(\\d+)",
        },
        exec,
      )) as AlternateScrapeResult;

    let scrapeMarkdown = "";
    let scrapeMedia: AlternateScrapeMedia | undefined;
    let scrapeMediaByAnchor: AlternateScrapeResult["mediaByAnchor"] | undefined;
    try {
      // First pass: shallow. It stops the crawl early whenever the opening
      // feed already holds enough cards in the requested window, which is the
      // common case for collection requests.
      const probe = await crawl(probeDepth);
      let markdown = probe.markdown ?? probe.summary ?? "";
      let media = probe.media;
      let mediaByAnchor = probe.mediaByAnchor;

      const remaining = targetCount - cachedAds.length;
      const windowCount = countAdsInWindow(markdown, dateRange, blocked());

      // Second pass: only when the shallow pass fell short, the request asked
      // for a deeper crawl, and the time still allows one. A deep crawl costs
      // ~51s measured, so spending the ceiling on one that cannot finish
      // would turn a thin result into no result at all.
      const deepBudgetMs = resolveCrawlAbortMs({
        pageTimeout: depth.pageTimeout,
        maxScrollSteps: depth.maxScrollSteps,
        scrollDelay: depth.scrollDelay,
        delayBeforeSnapshot: depth.delayBeforeSnapshot,
      });
      const elapsedMs = Date.now() - startedAt;
      const canAffordSecondPass =
        elapsedMs + deepBudgetMs + INGEST_RESERVE_MS <=
        SEARCH_AD_LIBRARY_TIMEOUT_MS;
      if (
        probeDepth.maxScrollSteps < depth.maxScrollSteps &&
        windowCount < remaining &&
        canAffordSecondPass
      ) {
        const full = await crawl(depth);
        const deeperMarkdown = full.markdown ?? full.summary ?? "";
        markdown = [markdown, deeperMarkdown].filter(Boolean).join("\n\n");
        media = mergeMedia(media, full.media);
        mediaByAnchor = mergeAnchoredMedia(mediaByAnchor, full.mediaByAnchor);
      }

      // Use the raw markdown (not the rendered summary) for parsing so the
      // appended "### Media" section cannot leak into the last ad card.
      scrapeMarkdown = markdown;
      scrapeMedia = media;
      scrapeMediaByAnchor = mediaByAnchor;

      // Ingestion is part of the live-scrape attempt: if the embedding
      // provider fails, the catch below returns cached ads instead of
      // surfacing a half-written pipeline.
      if (scrapeMarkdown) {
        await ingestScrapedAds({
          rawMarkdown: scrapeMarkdown,
          searchQuery: query,
          mediaByAnchor: scrapeMediaByAnchor,
        });
      }
    } catch (scrapeErr: unknown) {
      const errMsg =
        scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr);
      const notices = [
        `Live scrape encountered an issue (${errMsg}). Displaying cached ads from database.`,
      ];
      const shortfall = shortfallNotice(cachedAds.length);
      if (shortfall) notices.push(shortfall);

      const summary = buildAdLibraryTelemetry({
        query,
        country,
        dateRange,
        ads: cachedAds,
        excludeCount: previouslyAnalyzedAdIds.size,
        sessionExcludeCount: sessionDelivered.size,
        semanticCount,
        notices,
      });

      return {
        totalAds: cachedAds.length,
        summary,
      };
    }

    // Freshly ingested ads are joined to the query now, so a second read sees
    // them. `cachedAds` keep their reservation and are the head of the answer.
    const refreshedAdsRes = await getAdsByQuery(
      query,
      blocked(),
      targetCount * 5,
      { startDate: dateRange.startDate, endDate: dateRange.endDate },
    );
    const refreshedPool =
      refreshedAdsRes.success && refreshedAdsRes.data
        ? refreshedAdsRes.data
        : [];
    const finalAds = [
      ...cachedAds,
      ...deliver(refreshedPool, targetCount - cachedAds.length),
    ];

    // If the crawler returned media but we could not tie it to specific ad
    // cards, surface it explicitly as page-level video creatives.
    const hasPerAdMedia = (scrapeMediaByAnchor?.length ?? 0) > 0;
    const pageMedia = hasPerAdMedia ? undefined : scrapeMedia;

    const notices: string[] = [];
    const unparsedPage =
      Boolean(scrapeMarkdown) && parseMetaAdCards(scrapeMarkdown).length === 0;
    // Meta's own empty state: the crawl succeeded, the phrase simply has no
    // running ads in this window. Retrying would spend a crawl to learn
    // exactly this again, so the notice must not ask for one.
    const metaEmptyState =
      unparsedPage && /No ads match your search criteria/i.test(scrapeMarkdown);
    if (metaEmptyState) {
      notices.push(
        "Meta returned no ads for this phrase in the requested country and date window (the Ad Library page showed its empty state). This is a real zero-result, not a crawl failure. Widen the date range, drop the country filter, or use a broader phrase.",
      );
    } else if (unparsedPage) {
      // A page that parsed to nothing is a crawl problem, not a "no such ads"
      // answer; the model must not report the phrase as having no competitors.
      notices.push(
        "The crawled page contained no recognizable ad cards (Meta likely showed a sign-in or interstitial page). Cached ads, if any, are shown; retry the same search to fetch fresh ones.",
      );
    }
    // With a real zero-result the empty-state note is the whole story; the
    // "already delivered" explanation would blame deduplication for it.
    const shortfall = metaEmptyState
      ? undefined
      : shortfallNotice(finalAds.length);
    if (shortfall) notices.push(shortfall);

    const summary = buildAdLibraryTelemetry({
      query,
      country,
      dateRange,
      ads: finalAds,
      excludeCount: previouslyAnalyzedAdIds.size,
      sessionExcludeCount: sessionDelivered.size,
      semanticCount,
      notices,
      pageMedia,
    });

    return {
      totalAds: finalAds.length,
      summary,
    };
  },
});
