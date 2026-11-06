import { defineTool } from "@openai-harness/tools";
import type { ToolRunContext } from "@openai-harness/tools";
import type { AnchoredMedia } from "@openai-harness/scraper";
import { abortReason, createConcurrencyLimiter } from "./limiter";

/** Shape of the crawl4ai `/crawl` response the tool consumes. */
interface CrawlApiResponse {
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
}

export interface AlternateWebSearchArgs {
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

/** Headroom on top of the crawler's own page budget for queueing and transfer. */
const CRAWL_ABORT_BUFFER_MS = 30_000;

/**
 * Concurrent Ad Library crawls allowed per process.
 *
 * Meta is the expensive target: one crawl keeps a browser tab busy for tens of
 * seconds. A parallel batch of searches queues behind this gate instead of
 * opening a crawl per query.
 */
export const AD_LIBRARY_CRAWL_CONCURRENCY = 6;

/**
 * Hard ceiling on Ad Library scroll steps.
 *
 * This is the deepest the feed is ever read: measured, 15 steps yields ~175
 * cards in ~50s, and everything past the first page ranks below the 50-ad
 * delivery pool anyway. Collection depth asks for exactly this many steps, so
 * the clamp and the policy agree and no caller — including the model calling
 * `alternateWebSearch` directly — can read deeper or hold a crawler tab
 * longer.
 */
export const AD_LIBRARY_MAX_SCROLL_STEPS = 15;

/** Ad Library pages need enough navigation budget to hydrate the first cards. */
const AD_LIBRARY_MIN_PAGE_TIMEOUT_MS = 45_000;

/** Shared gate for Ad Library crawls; other scrape targets bypass it. */
const adLibraryCrawler = createConcurrencyLimiter(
  AD_LIBRARY_CRAWL_CONCURRENCY,
);

/**
 * Whether a URL is a Meta Ad Library search/results page.
 *
 * The crawler options that make sense for an infinite-scroll ad feed (forced
 * full-page scan, scroll-step cap) must not leak into ordinary page scrapes.
 *
 * @param url - candidate URL.
 */
export function isMetaAdLibraryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^(?:www|web|m)\./, "");
    if (host !== "facebook.com" && !host.endsWith(".facebook.com")) {
      return false;
    }
    return /^\/ads\/library(?:\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Normalize a caller-supplied wait condition to a CSS selector.
 *
 * The deployed crawler rejects JavaScript wait conditions from untrusted
 * requests and does not support XPath; forwarding either would fail the whole
 * crawl on a wait timeout, so unsupported conditions are dropped.
 *
 * @param value - raw `waitForSelector` argument.
 */
export function normalizeWaitForSelector(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^(?:js|xpath)\s*:/i.test(trimmed)) {
    console.warn(
      `[alternateWebSearch] Ignoring non-CSS waitForSelector: ${trimmed}`,
    );
    return undefined;
  }
  return trimmed;
}

/**
 * Clamp requested scroll steps into the supported range.
 *
 * @param requested - optional caller step count.
 */
export function resolveAdLibraryScrollSteps(requested?: number): number {
  const steps =
    requested !== undefined && Number.isFinite(requested)
      ? Math.floor(requested)
      : 10;
  return Math.max(1, Math.min(AD_LIBRARY_MAX_SCROLL_STEPS, steps));
}

/**
 * Translate tool arguments into the crawler's `CrawlerRunConfig` params.
 *
 * Ad Library URLs get the feed-oriented settings (full-page scan, step cap,
 * hydration floor); every other URL keeps the previous behavior unchanged.
 *
 * @param args - tool arguments.
 */
export function buildCrawlerParams(
  args: AlternateWebSearchArgs,
): Record<string, unknown> {
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
  if (waitForSelector) {
    params.wait_for = waitForSelector;
  }

  if (args.cssSelector) {
    params.css_selector = Array.isArray(args.cssSelector)
      ? args.cssSelector.join(", ")
      : args.cssSelector;
  }

  return params;
}

interface CrawlAbortBudgetArgs {
  pageTimeout?: number;
  maxScrollSteps?: number;
  scrollDelay?: number;
  delayBeforeSnapshot?: number;
}

/**
 * Wall-clock budget for the `/crawl` request.
 *
 * The crawler's `page_timeout` only bounds navigation, not time spent queued
 * behind other jobs, so the request itself needs a hard deadline. The budget
 * mirrors the configured crawl (page timeout, every scroll pause, and the
 * post-load snapshot delay the crawler waits out) and adds
 * {@link CRAWL_ABORT_BUFFER_MS} for queueing and transfer.
 */
export function resolveCrawlAbortMs(
  args: CrawlAbortBudgetArgs = {},
): number {
  const pageTimeout = args.pageTimeout ?? 60000;
  const maxScrollSteps = args.maxScrollSteps ?? 10;
  const scrollDelay = args.scrollDelay ?? 2.0;
  const delayBeforeSnapshot = args.delayBeforeSnapshot ?? 1.5;
  return (
    pageTimeout +
    maxScrollSteps * scrollDelay * 1000 +
    delayBeforeSnapshot * 1000 +
    CRAWL_ABORT_BUFFER_MS
  );
}

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
): AnchoredMedia[] {
  if (!html || !anchorPattern) return [];

  let anchorRe: RegExp;
  try {
    anchorRe = new RegExp(anchorPattern, "gi");
  } catch {
    console.warn(
      `[alternateWebSearch] Ignoring invalid mediaAnchorPattern: ${anchorPattern}`,
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

export const alternateWebSearchTool = defineTool({
  name: "alternateWebSearch",
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
    title: `Alternate web scrape: ${args.url}`,
    locations: [{ path: args.url }],
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "web",
    kind: "fetch",
    title: `Scraped: ${(result.meta as any)?.url ?? ""}`,
    url: (result.meta as any)?.url ?? "",
  }),
  async execute(args, exec?: ToolRunContext) {
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

    // Derive the abort budget from the params actually submitted: Ad Library
    // crawls raise the page timeout and clamp scroll steps, and a budget built
    // from the raw arguments could fire before the crawler's own timeout.
    const crawlBudget = {
      pageTimeout: crawlerParams.page_timeout as number,
      maxScrollSteps: crawlerParams.max_scroll_steps as number | undefined,
      scrollDelay: crawlerParams.scroll_delay as number,
      delayBeforeSnapshot: crawlerParams.delay_before_return_html as number,
    };

    /**
     * Submit one crawl. The abort budget covers only the crawl itself, so the
     * timer starts when a slot is granted, not while queued.
     */
    const launchCrawl = async (): Promise<CrawlApiResponse> => {
      const abortAfterMs = resolveCrawlAbortMs(crawlBudget);
      const controller = new AbortController();
      const upstream = exec?.signal;
      let timedOut = false;

      const abortTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, abortAfterMs);

      const onUpstreamAbort = (): void => controller.abort();
      if (upstream?.aborted) controller.abort();
      else upstream?.addEventListener("abort", onUpstreamAbort, { once: true });

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
            `Alternative scraper failed (HTTP ${res.status}): ${errText}`,
          );
        }

        return (await res.json()) as CrawlApiResponse;
      } catch (err) {
        if (timedOut) {
          throw new Error(
            `Alternate web scrape timed out after ${abortAfterMs}ms`,
            { cause: err },
          );
        }
        if (upstream?.aborted) throw abortReason(upstream);
        throw err;
      } finally {
        clearTimeout(abortTimer);
        upstream?.removeEventListener("abort", onUpstreamAbort);
      }
    };

    // Ad Library crawls share the process-wide gate; every other URL is
    // submitted immediately, exactly as before.
    const json = isMetaAdLibraryUrl(normUrl)
      ? await adLibraryCrawler.run(launchCrawl, exec?.signal)
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
