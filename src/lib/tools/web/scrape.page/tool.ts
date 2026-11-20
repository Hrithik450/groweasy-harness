import { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";

export const scrapeWebPageToolDefinition = {
  type: "function" as const,
  name: "scrapeWebPage",
  description:
    "Scrapes any live website, landing page, or web asset URL using Firecrawl with direct-asset fallback." +
    "Automatically handles HTML pages and direct SVG/image assets. Set `brand: true` only when inspecting a brand's own site: it runs the deep scan and returns brand tokens (title, description, theme color, favicon, OpenGraph image, keywords). Leave `brand` false for normal pages so the response stays minimal.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "The full website URL or asset URL to inspect (e.g. 'https://groweasy.ai', 'https://groweasy.ai/about-us', or 'https://groweasy.ai/logo.svg').",
      },
      onlyMainContent: {
        type: "boolean",
        description:
          "Whether to only return main content or full page structure including headers/footers (default false).",
      },
      brand: {
        type: "boolean",
        description:
          "Set true only for a brand's own website. Runs a deep scan and extracts brand tokens (title, description, theme color, favicon, OpenGraph image, keywords). Leave false/omit for normal pages; the response then stays minimal.",
      },
    },
    required: ["url"],
  },
};

export interface ScrapeWebPageArgs {
  url: string;
  onlyMainContent?: boolean;
  /** Deep brand scrape; adds metadata tokens and scans the full page. */
  brand?: boolean;
}

/**
 * Direct fetch fallback for SVGs, stylesheets, and image assets that Firecrawl cannot parse.
 */
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
        new Set(svgText.match(/#[0-9a-fA-F]{3,8}/g) || []),
      );

      let text = `### Direct SVG Asset: ${url}\n`;
      text += `- **Asset Type**: SVG Vector Graphic (${contentType || "image/svg+xml"})\n`;
      if (hexMatches.length > 0) {
        text += `- **Extracted Colors (Hex)**: ${hexMatches.join(", ")}\n`;
      }
      text += `- **SVG Structure**:\n\`\`\`xml\n${svgText.slice(0, 2500)}\n\`\`\`\n`;
      text += `- **Usage**: Valid direct remote image asset. Can be used for logoUrl or competitor logo if applicable.`;

      return { success: true, text };
    }

    if (
      contentType.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|ico|avif)(\?.*)?$/i.test(url)
    ) {
      const contentLength = res.headers.get("content-length");
      let text = `### Direct Image Asset: ${url}\n`;
      text += `- **Asset Type**: ${contentType || "Raster Image"}\n`;
      if (contentLength) {
        text += `- **File Size**: ${Math.round(Number(contentLength) / 1024)} KB\n`;
      }
      text += `- **Usage**: Valid direct remote image asset. You can assign this URL directly as a logo or graphic asset.`;

      return { success: true, text };
    }

    if (contentType.includes("css") || url.toLowerCase().includes(".css")) {
      const cssText = await res.text();
      const hexMatches = Array.from(
        new Set(cssText.match(/#[0-9a-fA-F]{3,8}/g) || []),
      );
      let text = `### Direct CSS Stylesheet: ${url}\n`;
      if (hexMatches.length > 0) {
        text += `- **Extracted Color Tokens**: ${hexMatches.slice(0, 15).join(", ")}\n`;
      }
      text += `- **Stylesheet Snippet**:\n\`\`\`css\n${cssText.slice(0, 3000)}\n\`\`\``;
      return { success: true, text };
    }

    const bodyText = await res.text();
    return {
      success: true,
      text: `### Remote File Content: ${url}\n\n${bodyText.slice(0, 4000)}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      text: `Direct fetch failed for ${url}: ${errorMsg}`,
    };
  }
}

export async function executeScrapeWebPageTool(
  input: ToolInput<ScrapeWebPageArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    return {
      success: false,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: "Error: FIRECRAWL_API_KEY is not configured.",
          },
        ],
      },
      error: "FIRECRAWL_API_KEY is not configured.",
    };
  }

  const { url, onlyMainContent = false, brand = false } = input.args || {};
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

  // 1. Pre-check: If the URL is explicitly an SVG, image, or stylesheet, handle via direct fetch directly
  const isDirectAsset = /\.(svg|png|jpe?g|webp|gif|ico|avif|css)(\?.*)?$/i.test(
    normUrl,
  );

  if (isDirectAsset) {
    const directResult = await handleDirectAssetFetch(normUrl);
    return {
      success: directResult.success,
      data: {
        contentParts: [{ type: "input_text", text: directResult.text }],
      },
      error: directResult.success ? undefined : directResult.text,
    };
  }

  // 2. Standard HTML page scrape via Firecrawl
  try {
    const res = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: normUrl,
        formats: ["markdown"],
        // Brand inspection needs the full page for metadata tokens.
        onlyMainContent: brand ? false : onlyMainContent,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || json.success === false) {
      const errorMsg =
        json.error || `Firecrawl scrape failed with status ${res.status}`;

      // 3. Fallback: If Firecrawl rejected the URL due to content type (e.g. SVG or binary image), fall back to direct fetch
      if (
        typeof errorMsg === "string" &&
        (errorMsg.includes("file type that Firecrawl cannot process") ||
          errorMsg.includes("image/svg+xml") ||
          errorMsg.includes("content type") ||
          errorMsg.includes("image"))
      ) {
        const directResult = await handleDirectAssetFetch(normUrl);
        return {
          success: directResult.success,
          data: {
            contentParts: [{ type: "input_text", text: directResult.text }],
          },
          error: directResult.success ? undefined : directResult.text,
        };
      }

      return {
        success: false,
        data: {
          contentParts: [
            { type: "input_text", text: `Scrape Error: ${errorMsg}` },
          ],
        },
        error: errorMsg,
      };
    }

    const data = json.data || {};
    const markdown = (data.markdown || "").trim();
    const metadata = data.metadata || {};

    const brandTokens = {
      title: metadata.title || metadata.ogTitle || metadata["og:title"],
      description:
        metadata.description ||
        metadata.ogDescription ||
        metadata["og:description"],
      themeColor: metadata["theme-color"] || metadata.themeColor,
      favicon: metadata.favicon,
      ogImage:
        metadata.ogImage || metadata["og:image"] || metadata["twitter:image"],
      sourceUrl: metadata.sourceURL || metadata.url || normUrl,
      keywords: metadata.keywords,
      language: metadata.language,
    };

    let responseText = `### Successfully Scraped: ${normUrl}\n\n`;

    if (brand) {
      responseText += `**Brand & Metadata Tokens:**\n`;
      responseText += `- **Page Title**: ${brandTokens.title || "N/A"}\n`;
      responseText += `- **Meta Description**: ${brandTokens.description || "N/A"}\n`;
      responseText += `- **Theme / Brand Color**: ${brandTokens.themeColor || "Not specified in meta"}\n`;
      responseText += `- **Favicon / Logo Asset**: ${brandTokens.favicon || "N/A"}\n`;
      responseText += `- **OpenGraph / Brand Image**: ${brandTokens.ogImage || "N/A"}\n`;
      if (brandTokens.keywords) {
        responseText += `- **Keywords**: ${brandTokens.keywords}\n`;
      }
      responseText += `\n`;
    }

    responseText += `**Rendered Page Content (Markdown):**\n\n`;
    responseText += markdown.slice(0, 25000);

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: responseText,
          },
        ],
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Network level fallback to direct fetch
    const directResult = await handleDirectAssetFetch(normUrl);
    if (directResult.success) {
      return {
        success: true,
        data: {
          contentParts: [{ type: "input_text", text: directResult.text }],
        },
      };
    }

    return {
      success: false,
      data: {
        contentParts: [
          { type: "input_text", text: `Firecrawl Scrape Error: ${errorMsg}` },
        ],
      },
      error: errorMsg,
    };
  }
}
