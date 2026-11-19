import { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const alternateWebSearchToolDefinition = {
  type: "function" as const,
  name: "alternateWebSearch",
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
      maxScrollSteps: {
        type: "number",
        description:
          "Maximum number of scroll steps during full page scan (e.g. 5 to 15).",
      },
      scrollDelay: {
        type: "number",
        description:
          "Pause between scroll steps in seconds to allow content hydration. format: floating point. Default: 2.0",
      },
      delayBeforeSnapshot: {
        type: "number",
        description:
          "Delay in seconds after page load before taking the DOM snapshot, allowing media and dynamic signed URLs to hydrate. format: floating point. Default: 2.0",
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
      pageTimeout: {
        type: "number",
        description:
          "Total navigation and crawl timeout in milliseconds (e.g. 60000 for 60 seconds, 120000 for 2 minutes). Increase when executing many scroll steps or crawling heavy dynamic pages. Default: 60000.",
      },
    },
    required: ["url", "scrollSteps", "pageTimeout"],
  },
};

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
}

export async function executeAlternateWebSearchTool(
  input: ToolInput<AlternateWebSearchArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
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
  } = input.args || {};

  if (!url || typeof url !== "string") {
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: "Error: URL is required." }],
      },
      error: "URL is required.",
    };
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
    });

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

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: rawContent.trim(),
          },
        ],
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    console.warn(`Alternate web scraper failed (${errorMsg})`);

    return {
      success: false,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Alternate Web Scrape Error: ${errorMsg}`,
          },
        ],
      },
      error: errorMsg,
    };
  }
}
