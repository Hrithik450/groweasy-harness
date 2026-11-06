import { defineTool } from "@openai-harness/tools";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search";

export interface SearchWebArgs {
  query: string;
  limit?: number;
  scrapeContent?: boolean;
}

export const searchWebTool = defineTool({
  name: "searchWeb",
  description:
    "Fast, accurate web search powered by Firecrawl. Searches live web pages, competitor offerings, marketing campaigns, and industry data. Returns ranked URLs, titles, descriptions, and page content.",
  timeoutMs: 30000,
  isConcurrencySafe: () => true,
  parameters: {
    query: {
      type: "string",
      required: true,
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
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        resultsCount: { type: "number", required: true },
        summary: { type: "string", required: true },
        results: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              url: { type: "string", required: true },
              title: { type: "string", required: true },
              description: { type: "string" },
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
    presentationMeta: (_args, value) => ({ results: value.results }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "search",
    title: `Web search: "${args.query}"`,
    rawInput: args,
  }),
  presentResult: (_args, result) => {
    return {
      card: "web",
      kind: "search",
      title: "Web search results",
      sources: (((result.meta as Record<string, unknown>)?.results || []) as Array<Record<string, unknown>>).map((r) => ({
        title: (r.title as string) || (r.url as string),
        url: r.url as string,
        snippet: r.description as string | undefined,
      })),
    };
  },
  async execute(args) {
    const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("FIRECRAWL_API_KEY is not configured.");
    }

    const query = args.query?.trim();
    if (!query) {
      throw new Error("query is required.");
    }

    const limit = Math.min(Math.max(1, args.limit ?? 5), 10);
    const scrapeContent = args.scrapeContent ?? true;

    const requestBody: Record<string, unknown> = {
      query,
      limit,
    };

    if (scrapeContent) {
      requestBody.scrapeOptions = {
        formats: ["markdown"],
      };
    }

    const res = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Firecrawl Search API error (${res.status}): ${errText}`);
    }

    const json = (await res.json()) as {
      success?: boolean;
      data?: Array<{
        url?: string;
        title?: string;
        description?: string;
        markdown?: string;
      }>;
    };

    const results = Array.isArray(json.data) ? json.data : [];
    if (results.length === 0) {
      return {
        resultsCount: 0,
        results: [],
        summary: `No search results found for: "${query}".`,
      };
    }

    const lines: string[] = [
      `### Web Search Results for: "${query}" (${results.length} result${results.length === 1 ? "" : "s"})\n`,
    ];

    const cleanResults: Array<{ url: string; title: string; description?: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const url = r.url || "N/A";
      const title = r.title || "Untitled";
      const description = r.description || "";
      cleanResults.push({ url, title, description });

      lines.push(`${i + 1}. **${title}**\n   URL: ${url}\n   Snippet: ${description}`);

      if (scrapeContent && r.markdown) {
        const preview = r.markdown.slice(0, 1500).trim();
        lines.push(`\n   *Page Content Preview*:\n   > ${preview.replace(/\n/g, "\n   > ")}\n`);
      }
    }

    return {
      resultsCount: results.length,
      results: cleanResults,
      summary: lines.join("\n"),
    };
  },
});
