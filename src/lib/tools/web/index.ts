import { defineTool } from "@/lib/tools/schema";

/** Media grouped under the nearest anchor match in the page HTML. */
export interface AnchoredMediaGroup {
  anchor: string;
  videos: string[];
  images: string[];
}

export interface WebSearchArgs {
  url: string;
  scanFullPage?: boolean;
  maxScrollSteps?: number;
  scrollDelay?: number;
  delayBeforeSnapshot?: number;
  waitForSelector?: string;
  processIframes?: boolean;
  cssSelector?: string | string[];
  pageTimeout?: number;
  mediaAnchorPattern?: string;
}

/** Maximum number of media URLs rendered into the human-readable summary. */
const MEDIA_SUMMARY_LIMIT = 40;

function normalizeMediaUrl(src: string): string {
  return src.replace(/&amp;/g, "&").trim();
}

function uniqueMediaUrls(urls: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    if (!raw) continue;
    const src = normalizeMediaUrl(raw);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    result.push(src);
  }
  return result;
}

/**
 * Groups crawler-extracted media by the nearest preceding anchor match in the
 * raw HTML (e.g. `Library ID: 123`). Crawl4AI exposes media per page, so DOM
 * order is the only reliable way to tie a media URL back to its ad card.
 *
 * Returns an empty array when the anchor pattern is invalid or the page has no
 * matching DOM (callers should fall back to a page-level media list).
 */
export function associateMediaByAnchor(
  html: string,
  anchorPattern: string,
  videos: string[],
  images: string[],
): AnchoredMediaGroup[] {
  if (!html || !anchorPattern) return [];

  let anchorRe: RegExp;
  try {
    anchorRe = new RegExp(anchorPattern, "gi");
  } catch {
    console.warn(
      `[webSearch] Ignoring invalid mediaAnchorPattern: ${anchorPattern}`,
    );
    return [];
  }

  const videoSet = new Set(videos);
  const imageSet = new Set(images);
  type MediaEvent = { pos: number; kind: "anchor" | "video" | "image"; value: string };
  const events: MediaEvent[] = [];

  for (const match of html.matchAll(anchorRe)) {
    const anchor = match[1];
    if (anchor && match.index !== undefined) {
      events.push({ pos: match.index, kind: "anchor", value: anchor });
    }
  }
  for (const match of html.matchAll(/<video\b[^>]*?\bsrc="([^"]+)"/gi)) {
    const src = normalizeMediaUrl(match[1]);
    if (match.index !== undefined && videoSet.has(src)) {
      events.push({ pos: match.index, kind: "video", value: src });
    }
  }
  for (const match of html.matchAll(/<img\b[^>]*?\bsrc="([^"]+)"/gi)) {
    const src = normalizeMediaUrl(match[1]);
    if (match.index !== undefined && imageSet.has(src)) {
      events.push({ pos: match.index, kind: "image", value: src });
    }
  }

  events.sort((a, b) => a.pos - b.pos);

  const grouped = new Map<string, { videos: string[]; images: string[] }>();
  let currentAnchor: string | null = null;
  for (const event of events) {
    if (event.kind === "anchor") {
      currentAnchor = event.value;
      continue;
    }
    if (!currentAnchor) continue;
    let group = grouped.get(currentAnchor);
    if (!group) {
      group = { videos: [], images: [] };
      grouped.set(currentAnchor, group);
    }
    if (event.kind === "video") group.videos.push(event.value);
    else group.images.push(event.value);
  }

  return Array.from(grouped, ([anchor, group]) => ({
    anchor,
    videos: uniqueMediaUrls(group.videos),
    images: uniqueMediaUrls(group.images),
  }));
}

import { abortReason, createConcurrencyLimiter } from "./limiter";

/** Ad Library pages need enough navigation budget to hydrate the first cards. */
const AD_LIBRARY_MIN_PAGE_TIMEOUT_MS = 45_000;
/** Headroom on top of the crawler's own page budget for queueing and transfer. */
const CRAWL_ABORT_BUFFER_MS = 30_000;
/** Concurrent Ad Library crawls allowed per process. */
const AD_LIBRARY_CRAWL_CONCURRENCY = 6;
/** Hard ceiling on Ad Library scroll steps. */
const AD_LIBRARY_MAX_SCROLL_STEPS = 15;

const adLibraryCrawler = createConcurrencyLimiter(AD_LIBRARY_CRAWL_CONCURRENCY);

/** Whether a URL is a Meta Ad Library search/results page. */
function isMetaAdLibraryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^(?:www|web|m)\./, "");
    if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return false;
    return /^\/ads\/library(?:\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Drop wait conditions the crawler cannot honour (JS/XPath). */
function normalizeWaitForSelector(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^(?:js|xpath)\s*:/i.test(trimmed)) {
    console.warn(
      `[webSearch] Ignoring non-CSS waitForSelector: ${trimmed}`,
    );
    return undefined;
  }
  return trimmed;
}

/** Clamp requested Ad Library scroll steps into the supported range. */
function resolveAdLibraryScrollSteps(requested?: number): number {
  const steps =
    requested !== undefined && Number.isFinite(requested)
      ? Math.floor(requested)
      : 10;
  return Math.max(1, Math.min(AD_LIBRARY_MAX_SCROLL_STEPS, steps));
}

/** Tool arguments → the crawler's CrawlerRunConfig params. */
function buildCrawlerParams(args: {
  url: string;
  scanFullPage?: boolean;
  maxScrollSteps?: number;
  scrollDelay?: number;
  delayBeforeSnapshot?: number;
  waitForSelector?: string;
  processIframes?: boolean;
  cssSelector?: string | string[];
  pageTimeout?: number;
}): Record<string, unknown> {
  const adLibrary = isMetaAdLibraryUrl(args.url);

  const params: Record<string, unknown> = {
    cache_mode: "bypass",
    wait_until: "domcontentloaded",
    page_timeout: args.pageTimeout ?? 60000,
    scan_full_page: args.scanFullPage ?? false,
    scroll_delay: args.scrollDelay ?? 2.0,
    delay_before_return_html: args.delayBeforeSnapshot ?? 1.5,
    remove_consent_popups: true,
    remove_overlay_elements: true,
    process_iframes: args.processIframes ?? false,
    excluded_tags: ["select", "option", "nav", "footer", "header", "form"],
    exclude_social_media_domains: false,
    exclude_external_images: false,
  };

  if (adLibrary) {
    params.scan_full_page = true;
    params.max_scroll_steps = resolveAdLibraryScrollSteps(args.maxScrollSteps);
    params.page_timeout = Math.max(
      args.pageTimeout ?? 60000,
      AD_LIBRARY_MIN_PAGE_TIMEOUT_MS,
    );
  } else if (args.maxScrollSteps !== undefined) {
    params.max_scroll_steps = args.maxScrollSteps;
  }

  const waitForSelector = normalizeWaitForSelector(args.waitForSelector);
  if (waitForSelector) params.wait_for = waitForSelector;

  if (args.cssSelector) {
    params.css_selector = Array.isArray(args.cssSelector)
      ? args.cssSelector.join(", ")
      : args.cssSelector;
  }

  return params;
}

/** Wall-clock budget for the `/crawl` request itself. */
function resolveCrawlAbortMs(budget: {
  pageTimeout?: number;
  maxScrollSteps?: number;
  scrollDelay?: number;
  delayBeforeSnapshot?: number;
}): number {
  const pageTimeout = budget.pageTimeout ?? 60000;
  const maxScrollSteps = budget.maxScrollSteps ?? 10;
  const scrollDelay = budget.scrollDelay ?? 2.0;
  const delayBeforeSnapshot = budget.delayBeforeSnapshot ?? 1.5;
  return (
    pageTimeout +
    maxScrollSteps * scrollDelay * 1000 +
    delayBeforeSnapshot * 1000 +
    CRAWL_ABORT_BUFFER_MS
  );
}

export const webSearchTool = defineTool({
  name: "webSearch",
  description:
    "High-performance self-hosted web searcher/scraper with native media extraction. Scrapes dynamic websites, single-page applications, and media-rich pages, capturing LLM-ready markdown.",
  timeoutMs: 90000,
  isConcurrencySafe: () => true,
  parameters: {
    url: {
      type: "string",
      required: true,
      description:
        "The full website URL to search/scrape (e.g. 'https://www.facebook.com/ads/library/?...' or 'https://groweasy.ai').",
    },
    scanFullPage: {
      type: "boolean",
      description:
        "Auto-scrolls the entire page from top to bottom. Recommended for infinite-scroll feeds like Meta Ad Library or product catalogs.",
    },
    maxScrollSteps: {
      type: "number",
      description:
        "Maximum number of scroll steps during full page scan (e.g. 5 to 15).",
    },
    scrollDelay: {
      type: "number",
      description:
        "Pause between scroll steps in seconds to allow content hydration. Default: 2.0",
    },
    delayBeforeSnapshot: {
      type: "number",
      description:
        "Delay in seconds after page load before taking the DOM snapshot. Default: 2.0",
    },
    waitForSelector: {
      type: "string",
      description:
        "Optional CSS selector to wait for before scraping (e.g. 'css:[data-testid=\"ad_card\"]').",
    },
    processIframes: {
      type: "boolean",
      description:
        "Recursively extract content inside embedded iframe elements. Default: false.",
    },
    cssSelector: {
      type: "string",
      description:
        "Restrict content extraction strictly to elements matching one or more CSS selectors.",
    },
    pageTimeout: {
      type: "number",
      description:
        "Total navigation and crawl timeout in milliseconds. Default: 60000.",
    },
    mediaAnchorPattern: {
      type: "string",
      description:
        "Optional regular expression with one capture group. Each extracted image/video URL is grouped under the nearest preceding match in the page HTML (e.g. 'Library ID:\\\\s*(\\\\d+)' for Meta Ad Library). Groups are returned in mediaByAnchor.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        url: { type: "string", required: true },
        summary: { type: "string", required: true },
        markdown: { type: "string" },
        media: {
          type: "object",
          additionalProperties: false,
          properties: {
            videos: { type: "array", items: { type: "string" }, required: true },
            images: { type: "array", items: { type: "string" }, required: true },
          },
          required: true,
        },
        mediaByAnchor: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              anchor: { type: "string", required: true },
              videos: { type: "array", items: { type: "string" }, required: true },
              images: { type: "array", items: { type: "string" }, required: true },
            },
          },
        },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ url: value.url }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "fetch",
    title: `Web search: ${args.url}`,
    locations: [{ path: args.url }],
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "web",
    kind: "fetch",
    title: `Scraped: ${(result.meta as any)?.url ?? ""}`,
    url: (result.meta as any)?.url ?? "",
  }),
  async execute(args) {
    const normUrl = (args.url || "").trim();
    if (!normUrl) {
      throw new Error("url is required.");
    }

    const baseUrl = process.env.ALTERNATIVE_WEB_SCRAPER_URL?.trim();
    const token = process.env.ALTERNATIVE_WEB_SCRAPER_TOKEN?.trim();

    if (!baseUrl) {
      throw new Error("ALTERNATIVE_WEB_SCRAPER_URL is not configured.");
    }

    const crawlerParams = buildCrawlerParams({ ...args, url: normUrl });
    const crawlBudget = {
      pageTimeout: crawlerParams.page_timeout as number,
      maxScrollSteps: crawlerParams.max_scroll_steps as number | undefined,
      scrollDelay: crawlerParams.scroll_delay as number,
      delayBeforeSnapshot: crawlerParams.delay_before_return_html as number,
    };

    /** Submit one crawl under its own abort budget. */
    const launchCrawl = async (): Promise<{
      results?: Array<{
        url?: string;
        html?: string;
        markdown?: { raw_markdown?: string };
        media?: {
          images?: Array<{ src?: string; alt?: string; desc?: string }>;
          videos?: Array<{ src?: string; desc?: string }>;
        };
        metadata?: { title?: string; description?: string };
        status_code?: number;
      }>;
    }> => {
      const abortAfterMs = resolveCrawlAbortMs(crawlBudget);
      const controller = new AbortController();
      let timedOut = false;
      const abortTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, abortAfterMs);

      try {
        const res = await fetch(`${baseUrl}/crawl`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            urls: [normUrl],
            browser_config: {
              type: "BrowserConfig",
              params: {
                headless: true,
                enable_stealth: true,
                viewport_width: 1920,
                viewport_height: 1080,
              },
            },
            crawler_config: {
              type: "CrawlerRunConfig",
              params: crawlerParams,
            },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(
            `Web search failed (HTTP ${res.status}): ${errText}`,
          );
        }

        return (await res.json()) as Awaited<ReturnType<typeof launchCrawl>>;
      } catch (err) {
        if (timedOut) {
          throw new Error(`Web search timed out after ${abortAfterMs}ms`, {
            cause: err,
          });
        }
        throw err;
      } finally {
        clearTimeout(abortTimer);
      }
    };

    // Ad Library crawls share the process-wide gate; other URLs go straight in.
    const json = isMetaAdLibraryUrl(normUrl)
      ? await adLibraryCrawler.run(launchCrawl)
      : await launchCrawl();

    const firstResult = json.results?.[0];
    if (!firstResult) {
      throw new Error(`Scraper returned no result for URL: ${normUrl}`);
    }

    const rawMarkdown = firstResult.markdown?.raw_markdown || "";
    const title = firstResult.metadata?.title || "Untitled";

    // Crawl4AI extracts media per page. Prior versions discarded these arrays
    // entirely, so video creatives never reached the caller even though the
    // crawler returned real CDN URLs.
    const videos = uniqueMediaUrls(
      (firstResult.media?.videos ?? []).map((video) => video.src),
    );
    const images = uniqueMediaUrls(
      (firstResult.media?.images ?? []).map((image) => image.src),
    );
    const mediaByAnchor =
      args.mediaAnchorPattern && firstResult.html
        ? associateMediaByAnchor(
            firstResult.html,
            args.mediaAnchorPattern,
            videos,
            images,
          )
        : [];

    const mediaLines: string[] = [];
    const allMedia = [
      ...videos.map((src) => ({ label: "Video", src })),
      ...images.map((src) => ({ label: "Image", src })),
    ];
    for (const item of allMedia.slice(0, MEDIA_SUMMARY_LIMIT)) {
      mediaLines.push(`- ${item.label}: ${item.src}`);
    }
    if (allMedia.length > MEDIA_SUMMARY_LIMIT) {
      mediaLines.push(
        `- ...and ${allMedia.length - MEDIA_SUMMARY_LIMIT} more media URLs (available in the structured media field)`,
      );
    }

    const lines: string[] = [
      `### Scraped: ${title} (${normUrl})`,
      `HTTP Status: ${firstResult.status_code || 200}\n`,
      rawMarkdown || "(No text content extracted)",
    ];

    if (mediaLines.length > 0) {
      lines.push(`\n### Media\n${mediaLines.join("\n")}`);
    }

    return {
      url: normUrl,
      summary: lines.join("\n"),
      markdown: rawMarkdown,
      media: { videos, images },
      ...(mediaByAnchor.length > 0 ? { mediaByAnchor } : {}),
    };
  },
});

// Real search/scrape implementations live in their own modules.
export * from "./scrape.page/tool";
