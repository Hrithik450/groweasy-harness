import { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search";

export const searchWebToolDefinition = {
  type: "function" as const,
  name: "searchWeb",
  description:
    "Fast, accurate web search powered by Firecrawl. Searches live web pages, competitor offerings, marketing campaigns, and industry data. Returns ranked URLs, titles, descriptions, and page content.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query, keywords, brand name, or competitor terms.",
      },
      limit: {
        type: "number",
        description:
          "Maximum number of search results to return (1-10, default 5).",
      },
      scrapeContent: {
        type: "boolean",
        description:
          "Whether to include markdown page content for top results (default true).",
      },
    },
    required: ["query"],
  },
};

export interface SearchWebArgs {
  query: string;
  limit?: number;
  scrapeContent?: boolean;
}

export async function executeSearchWebTool(
  input: ToolInput<SearchWebArgs>,
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

  const { query, limit = 5, scrapeContent = true } = input.args || {};
  if (!query || typeof query !== "string") {
    return {
      success: false,
      data: {
        contentParts: [
          { type: "input_text", text: "Error: Search query is required." },
        ],
      },
      error: "Search query is required.",
    };
  }

  try {
    const bodyPayload: Record<string, unknown> = {
      query: query.trim(),
      limit: Math.min(Math.max(limit, 1), 10),
    };

    if (scrapeContent) {
      bodyPayload.scrapeOptions = {
        formats: ["markdown"],
      };
    }

    const res = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || json.success === false) {
      const errorMsg =
        json.error || `Firecrawl search failed with status ${res.status}`;
      return {
        success: false,
        data: {
          contentParts: [
            { type: "input_text", text: `Search Error: ${errorMsg}` },
          ],
        },
        error: errorMsg,
      };
    }

    const results = Array.isArray(json.data) ? json.data : [];

    if (results.length === 0) {
      return {
        success: true,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `No search results found for query: "${query}".`,
            },
          ],
        },
      };
    }

    const formatted = results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any, i: number) => {
        let block =
          `### Result ${i + 1}: ${item.title || "Untitled"}\n` +
          `- **URL**: ${item.url || "N/A"}\n` +
          `- **Description**: ${item.description || "N/A"}`;
        if (item.markdown) {
          const cleanSnippet = item.markdown.slice(0, 2500);
          block += `\n- **Page Snippet**:\n${cleanSnippet}`;
        }
        return block;
      })
      .join("\n\n---\n\n");

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Web Search Results for "${query}":\n\n${formatted}`,
          },
        ],
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [
          { type: "input_text", text: `Firecrawl Search Error: ${errorMsg}` },
        ],
      },
      error: errorMsg,
    };
  }
}
