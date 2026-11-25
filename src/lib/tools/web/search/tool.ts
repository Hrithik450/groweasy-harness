import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const webSearchToolDefinition = {
  type: "function" as const,
  name: "webSearch",
  description:
    "Reads one web page with the self-hosted headless crawler and returns LLM-ready markdown plus media URLs. One page-load, no scrolling — use `scrapeWebPage` when the whole page must be scraped.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "The full website URL to search/scrape (e.g. 'https://www.facebook.com/ads/library/?...' or 'https://groweasy.ai').",
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

/**
 * The crawler (Crawl4AI v0.9.6) is async-only: `POST /crawl` was removed, so
 * a crawl is submitted to `/crawl/job` and its result collected by polling
 * `/crawl/job/{task_id}`. Two seconds keeps polling comfortably under the
 * server's 120 req/min limit while still surfacing a typical crawl promptly.
 */
const CRAWL_JOB_POLL_MS = 2_000;

interface Crawl4aiResult {
  success?: boolean;
  error_message?: string;
  cleaned_html?: string;
  html?: string;
  markdown?:
    | string
    | {
        fit_markdown?: string;
        raw_markdown?: string;
        markdown_with_citations?: string;
      };
  media?: {
    videos?: Array<{ src?: string }>;
    images?: Array<{ src?: string }>;
  };
  metadata?: { title?: string };
}

interface Crawl4aiJobStatus {
  status?: string;
  error?: string;
  result?: unknown;
}

function resolveCrawlAbortMs(args: WebSearchCrawlArgs): number {
  return (
    (args.pageTimeout ?? 60000) +
    (args.maxScrollSteps ?? 10) * (args.scrollDelay ?? 2.0) * 1000 +
    (args.delayBeforeSnapshot ?? 1.5) * 1000 +
    CRAWL_ABORT_BUFFER_MS
  );
}

/** Abort-aware sleep so the crawl budget also bounds time spent polling. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** A job response carries `{success, results: [...]}`; older shapes are flat. */
function crawlResultFrom(payload: unknown): Crawl4aiResult | undefined {
  if (Array.isArray(payload)) {
    return payload[0] as Crawl4aiResult | undefined;
  }
  if (payload && typeof payload === "object") {
    const body = payload as Crawl4aiResult & { results?: Crawl4aiResult[] };
    return body.results?.[0] ?? body;
  }
  return undefined;
}

async function submitCrawlJob(
  baseUrl: string,
  token: string,
  body: unknown,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(`${baseUrl}/crawl/job`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300).trim();
    throw new Error(
      `Crawl4AI rejected the crawl job (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  const json = (await res.json().catch(() => ({}))) as { task_id?: unknown };
  if (typeof json.task_id !== "string" || json.task_id.length === 0) {
    throw new Error("Crawl4AI did not return a job id.");
  }
  return json.task_id;
}

async function waitForCrawlJob(
  baseUrl: string,
  token: string,
  taskId: string,
  signal: AbortSignal,
): Promise<Crawl4aiResult> {
  for (;;) {
    const res = await fetch(
      `${baseUrl}/crawl/job/${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal,
      },
    );

    if (!res.ok) {
      throw new Error(
        `Crawl4AI job ${taskId} status check failed (HTTP ${res.status})`,
      );
    }

    const job = (await res.json().catch(() => ({}))) as Crawl4aiJobStatus;

    if (job.status === "completed") {
      const result = crawlResultFrom(job.result);
      if (!result) {
        throw new Error("No result returned from Crawl4AI scraper.");
      }
      if (result.success === false) {
        throw new Error(
          result.error_message || "Crawl4AI reported success: false.",
        );
      }
      return result;
    }

    if (job.status === "failed") {
      const error = typeof job.error === "string" ? job.error.trim() : "";
      throw new Error(error || `Crawl4AI job ${taskId} failed.`);
    }

    await delay(CRAWL_JOB_POLL_MS, signal);
  }
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

  if (!baseUrl) {
    return failure("ALTERNATIVE_WEB_SCRAPER_URL is not configured.");
  }
  if (!token) {
    return failure("ALTERNATIVE_WEB_SCRAPER_TOKEN is not configured.");
  }

  try {
    const crawlerParams: Record<string, unknown> = {
      cache_mode: "bypass",
      wait_until: "domcontentloaded",
      page_timeout: pageTimeout ?? 60000,
      scan_full_page: scanFullPage ?? false,
      // 1s per scroll step by default; deep crawls pass their own delay.
      scroll_delay: scrollDelay ?? (scanFullPage ? 1.0 : 2.0),
      delay_before_return_html: delayBeforeSnapshot ?? 1.5,
      remove_consent_popups: true,
      remove_overlay_elements: true,
      process_iframes: processIframes ?? false,
      excluded_tags: ["select", "option", "nav", "footer", "header", "form"],
      exclude_social_media_domains: false,
      exclude_external_images: false,
    };

    if (scanFullPage) {
      // A full-page scan must never run unbounded: cap it unless the caller
      // (the ad-library pipeline) passes its own depth.
      crawlerParams.max_scroll_steps = maxScrollSteps ?? 10;
    } else if (maxScrollSteps !== undefined) {
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

    let result: Crawl4aiResult;
    try {
      const taskId = await submitCrawlJob(
        baseUrl,
        token,
        {
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
        },
        controller.signal,
      );
      result = await waitForCrawlJob(baseUrl, token, taskId, controller.signal);
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
  // The model no longer controls scanning (see the tool schema): one page
  // load, no scrolling. Internal callers use crawlWebPage directly.
  const { scanFullPage: _ignored, ...modelArgs } = input.args ?? {};
  const crawled = await crawlWebPage({ ...input, args: modelArgs });
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
