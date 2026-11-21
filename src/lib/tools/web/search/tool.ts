import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const webSearchToolDefinition = {
  type: "function" as const,
  name: "webSearch",
  description:
    "High-performance self-hosted web searcher/scraper with native media extraction. Scrapes dynamic websites, single-page applications, and media-rich pages, capturing LLM-ready markdown.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "The full website URL to search/scrape (e.g. 'https://www.facebook.com/ads/library/?...' or 'https://groweasy.ai').",
      },
      scanFullPage: {
        type: "boolean",
        description:
          "Auto-scrolls the entire page from top to bottom. Recommended for infinite-scroll feeds like Meta Ad Library or product catalogs.",
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
        description:
          "Restrict content extraction strictly to elements matching one or more CSS selectors. Supports a single selector, multiple comma-separated selectors (e.g. 'article, .ad-card, #pricing'), or an array of selector strings.",
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
      },
    },
    required: ["url"],
  },
};

export interface WebSearchArgs {
  url: string;
  scanFullPage?: boolean;
  waitForSelector?: string;
  processIframes?: boolean;
  cssSelector?: string | string[];
}

/** Internal crawl tuning, derived by the caller (never sent by the model). */
export interface WebSearchCrawlArgs extends WebSearchArgs {
  maxScrollSteps?: number;
  scrollDelay?: number;
  delayBeforeSnapshot?: number;
  pageTimeout?: number;
  mediaAnchorPattern?: string;
}

export interface WebSearchMedia {
  videos: string[];
  images: string[];
}

/** Media URLs grouped under the nearest preceding anchor match in the HTML. */
export interface AnchoredMediaGroup extends WebSearchMedia {
  anchor: string;
}

/** Structured crawl result; model-facing text is rendered from it. */
export interface WebSearchCrawlResult {
  url: string;
  title: string;
  markdown: string;
  /** Every creative URL, grouped under its owning card (empty without an anchor). */
  mediaByAnchor: AnchoredMediaGroup[];
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
 * Groups crawler-extracted media under the card whose anchor precedes it in
 * the raw HTML. Meta's DOM puts the `Library ID: 123` line before that card's
 * body and media, so DOM order ties each URL to its card.
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

  type MediaEvent = { pos: number; kind: "video" | "image"; value: string };
  const anchors: Array<{ pos: number; anchor: string }> = [];
  const media: MediaEvent[] = [];

  for (const match of html.matchAll(anchorRe)) {
    const anchor = match[1];
    if (anchor && match.index !== undefined) {
      anchors.push({ pos: match.index, anchor });
    }
  }
  if (anchors.length === 0) return [];
  anchors.sort((a, b) => a.pos - b.pos);

  for (const match of html.matchAll(/<video\b[^>]*?\bsrc="([^"]+)"/gi)) {
    const src = normalizeMediaUrl(match[1]);
    if (match.index !== undefined && videoSet.has(src)) {
      media.push({ pos: match.index, kind: "video", value: src });
    }
  }

  for (const match of html.matchAll(/<img\b[^>]*?\bsrc="([^"]+)"/gi)) {
    const src = normalizeMediaUrl(match[1]);
    if (match.index !== undefined && imageSet.has(src)) {
      media.push({ pos: match.index, kind: "image", value: src });
    }
  }
  media.sort((a, b) => a.pos - b.pos);

  const grouped = new Map<string, WebSearchMedia>();
  let anchorIndex = -1;
  for (const event of media) {
    while (
      anchorIndex + 1 < anchors.length &&
      anchors[anchorIndex + 1].pos < event.pos
    ) {
      anchorIndex++;
    }
    if (anchorIndex < 0) continue;

    const anchor = anchors[anchorIndex].anchor;
    let group = grouped.get(anchor);
    if (!group) {
      group = { videos: [], images: [] };
      grouped.set(anchor, group);
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

/** Headroom on top of the crawler's own budget for queueing and transfer. */
const CRAWL_ABORT_BUFFER_MS = 30_000;

function resolveCrawlAbortMs(args: WebSearchCrawlArgs): number {
  return (
    (args.pageTimeout ?? 60000) +
    (args.maxScrollSteps ?? 10) * (args.scrollDelay ?? 2.0) * 1000 +
    (args.delayBeforeSnapshot ?? 1.5) * 1000 +
    CRAWL_ABORT_BUFFER_MS
  );
}

export async function crawlWebPage(
  input: ToolInput<WebSearchCrawlArgs>,
): Promise<ToolOutput<WebSearchCrawlResult>> {
  const {
    url,
    scanFullPage,
    maxScrollSteps,
    scrollDelay,
    delayBeforeSnapshot,
    waitForSelector,
    processIframes,
    cssSelector,
    pageTimeout,
    mediaAnchorPattern,
  } = input.args || {};

  if (!url || typeof url !== "string") {
    return failure("URL is required.");
  }

  const normUrl = url.trim();
  const baseUrl = process.env.ALTERNATIVE_WEB_SCRAPER_URL?.trim();
  const token = process.env.ALTERNATIVE_WEB_SCRAPER_TOKEN?.trim();

  try {
    const crawlerParams: Record<string, unknown> = {
      cache_mode: "bypass",
      wait_until: "domcontentloaded",
      page_timeout: pageTimeout ?? 60000,
      scan_full_page: scanFullPage ?? false,
      scroll_delay: scrollDelay ?? 2.0,
      delay_before_return_html: delayBeforeSnapshot ?? 1.5,
      remove_consent_popups: true,
      remove_overlay_elements: true,
      process_iframes: processIframes ?? false,
      excluded_tags: ["select", "option", "nav", "footer", "header", "form"],
      exclude_social_media_domains: false,
      exclude_external_images: false,
    };

    if (maxScrollSteps !== undefined) {
      crawlerParams.max_scroll_steps = maxScrollSteps;
    }

    if (waitForSelector) {
      crawlerParams.wait_for = waitForSelector;
    }

    if (cssSelector) {
      crawlerParams.css_selector = Array.isArray(cssSelector)
        ? cssSelector
            .filter(
              (s): s is string => typeof s === "string" && s.trim().length > 0,
            )
            .join(", ")
        : cssSelector;
    }

    const abortAfterMs = resolveCrawlAbortMs(input.args);

    const controller = new AbortController();

    let timedOut = false;
    const abortTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, abortAfterMs);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/crawl`, {
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

    if (!res.ok) {
      throw new Error(
        `Alternate web search tool returned HTTP status ${res.status}`,
      );
    }

    const json = await res.json().catch(() => ({}));
    const result = Array.isArray(json) ? json[0] : json.results?.[0] || json;

    if (!result) {
      throw new Error("No result returned from Crawl4AI scraper.");
    }

    let markdown = "";
    if (typeof result.markdown === "object" && result.markdown !== null) {
      markdown =
        result.markdown.fit_markdown ||
        result.markdown.raw_markdown ||
        result.markdown.markdown_with_citations ||
        "";
    } else if (typeof result.markdown === "string") {
      markdown = result.markdown;
    }

    const rawContent = markdown || result.cleaned_html || "";

    const videos = uniqueMediaUrls(
      (result.media?.videos ?? []).map((video: { src?: string }) => video.src),
    );
    const images = uniqueMediaUrls(
      (result.media?.images ?? []).map((image: { src?: string }) => image.src),
    );

    // Markdown drops <video>/<img> tags, so card order has to come from HTML.
    const mediaByAnchor =
      mediaAnchorPattern && typeof result.html === "string"
        ? associateMediaByAnchor(
            result.html,
            mediaAnchorPattern,
            videos,
            images,
          )
        : [];

    return {
      success: true,
      data: {
        url: normUrl,
        title: result.metadata?.title || "Untitled",
        markdown: rawContent,
        mediaByAnchor,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    console.warn(`Web-Search failed (${errorMsg})`);

    return failure(errorMsg);
  }
}

/** Model-facing surface: the crawl's markdown becomes the tool content. */
export async function executeWebSearchTool(
  input: ToolInput<WebSearchCrawlArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const crawled = await crawlWebPage(input);
  if (!crawled.success || !crawled.data) {
    return {
      success: false,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Error: ${crawled.error ?? "Web search failed."}`,
          },
        ],
      },
      error: crawled.error,
    };
  }

  return {
    success: true,
    data: {
      contentParts: [
        { type: "input_text", text: crawled.data.markdown.trim() },
      ],
    },
  };
}
