import { defineTool } from "@openai-harness/tools";

import { isMetaAdLibraryUrl } from "../alternate-scrape/tool";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";

export interface ScrapeWebPageArgs {
  url: string;
  onlyMainContent?: boolean;
}

async function handleDirectAssetFetch(
  url: string,
): Promise<{ success: boolean; text: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
    });

    if (!res.ok) {
      return {
        success: false,
        text: `Failed to fetch remote asset: ${url} (HTTP ${res.status})`,
      };
    }

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("svg") || url.toLowerCase().includes(".svg")) {
      const svgText = await res.text();
      const hexMatches = Array.from(
        new Set(
          svgText.match(/#[0-9a-fA-F]{3,8}\b/g)?.map((c) => c.toLowerCase()) ||
            [],
        ),
      );

      const widthMatch = svgText.match(/width=["'](\d+)(?:px)?["']/i);
      const heightMatch = svgText.match(/height=["'](\d+)(?:px)?["']/i);
      const viewBoxMatch = svgText.match(
        /viewBox=["'][\d\.\s,-]+?([\d\.]+)\s+([\d\.]+)["']/i,
      );

      const width = widthMatch?.[1] || viewBoxMatch?.[1] || "unknown";
      const height = heightMatch?.[1] || viewBoxMatch?.[2] || "unknown";

      const lines = [
        `### Direct Vector SVG Asset: ${url}`,
        `- **Format**: Vector XML/SVG`,
        `- **Detected Dimensions**: ${width}x${height}`,
        `- **Embedded Hex Colors**: ${hexMatches.length > 0 ? hexMatches.join(", ") : "None detected"}`,
        `\n#### SVG XML Markup:\n\`\`\`xml\n${svgText.slice(0, 4000)}\n\`\`\``,
      ];

      return { success: true, text: lines.join("\n") };
    }

    return {
      success: true,
      text: `### Remote Asset: ${url}\n- Content-Type: ${contentType}\n- Length: ${res.headers.get("content-length") || "unknown"} bytes`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      text: `Error fetching direct asset: ${msg}`,
    };
  }
}

export const scrapeWebPageTool = defineTool({
  name: "scrapeWebPage",
  description:
    "Scrapes an ordinary web page, landing page, or web asset URL (markdown, design tokens, SVG/image XML). Not for Meta Ad Library URLs: use searchAdLibrary, which crawls the ad feed with the alternate scraper.",
  timeoutMs: 60000,
  isConcurrencySafe: () => true,
  parameters: {
    url: {
      type: "string",
      required: true,
      description:
        "The full website URL or asset URL to inspect (e.g. 'https://groweasy.ai', 'https://groweasy.ai/about-us', or 'https://groweasy.ai/logo.svg').",
    },
    onlyMainContent: {
      type: "boolean",
      description:
        "Whether to only return main content or full page structure including headers/footers (default false).",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        url: { type: "string", required: true },
        summary: { type: "string", required: true },
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
    title: `Scrape web page: ${args.url}`,
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
    const rawUrl = args.url?.trim();
    if (!rawUrl) {
      throw new Error("url is required.");
    }

    // The Ad Library is an infinite-scroll feed behind a bot wall: Firecrawl
    // returns an empty shell with no cards. The ad pipeline owns that target
    // end to end (alternate scraper, card parsing, caching), so routing is
    // refused here instead of silently spending a request on a page that
    // cannot answer.
    if (isMetaAdLibraryUrl(rawUrl)) {
      throw new Error(
        "Meta Ad Library pages are not scraped by scrapeWebPage. Use searchAdLibrary (query-based) or alternateWebSearch (explicit URL); both load the feed with the alternate scraper.",
      );
    }

    const lowerUrl = rawUrl.toLowerCase();
    const isDirectAsset =
      lowerUrl.endsWith(".svg") ||
      lowerUrl.endsWith(".png") ||
      lowerUrl.endsWith(".jpg") ||
      lowerUrl.endsWith(".jpeg") ||
      lowerUrl.endsWith(".webp") ||
      lowerUrl.endsWith(".css");

    if (isDirectAsset) {
      const assetResult = await handleDirectAssetFetch(rawUrl);
      if (assetResult.success) {
        return {
          url: rawUrl,
          summary: assetResult.text,
        };
      }
    }

    const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("FIRECRAWL_API_KEY is not configured.");
    }

    const onlyMainContent = args.onlyMainContent ?? false;

    const res = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: rawUrl,
        formats: ["markdown", "html"],
        onlyMainContent,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const fallback = await handleDirectAssetFetch(rawUrl);
      if (fallback.success) {
        return {
          url: rawUrl,
          summary: fallback.text,
        };
      }
      throw new Error(`Firecrawl Scrape API error (${res.status}): ${errText}`);
    }

    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        markdown?: string;
        metadata?: {
          title?: string;
          description?: string;
          statusCode?: number;
          [key: string]: unknown;
        };
      };
    };

    const data = json.data || {};
    const markdown = data.markdown || "";
    const meta = data.metadata || {};

    const lines: string[] = [
      `### Scraped Page: ${rawUrl}`,
      `- **Title**: ${meta.title || "N/A"}`,
      `- **Description**: ${meta.description || "N/A"}`,
      `- **HTTP Status**: ${meta.statusCode || 200}`,
      `\n#### Page Content (Markdown):\n`,
      markdown || "(No content extracted)",
    ];

    return {
      url: rawUrl,
      summary: lines.join("\n"),
    };
  },
});
