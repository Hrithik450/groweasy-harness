import type { Session } from "@openai-harness/session";
import { executeShopifyGraphQuery } from "@openai-harness/connector-shopify";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface FetchShopifyCollectionsArgs {
  query?: string;
  limit?: number;
  cursor?: string;
}

export const fetchShopifyCollectionsTool = defineTool({
  name: "fetchShopifyCollections",
  description:
    "Fetch product collections, categories, smart collections, and rules from the connected Shopify store using free-form Shopify Admin GraphQL queries (2025-01).",
  timeoutMs: 30000,
  isConcurrencySafe: () => true,
  parameters: {
    query: {
      type: "string",
      description:
        "Free-form GraphQL query string to execute against Shopify Admin GraphQL API (or collection title filter). If omitted or passed as a search filter, a standard collections query is executed.",
    },
    limit: {
      type: "number",
      description:
        "Optional maximum number of collections to return (default 50).",
    },
    cursor: {
      type: "string",
      description:
        "Optional pagination cursor to fetch the next page of collections.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string", required: true },
        count: { type: "number", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ count: value.count }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "fetch",
    title: `Fetch Shopify collections${args.query ? ` (${args.query})` : ""}`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "fetch",
    title: `Shopify collections fetched (${(result.meta as any)?.count ?? 0} collections)`,
    content: result.content,
  }),
  async execute(args, exec) {
    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error(
        "User authentication context required to fetch Shopify collections.",
      );
    }

    const rawQuery = args.query?.trim();
    const limit = Math.min(Math.max(args.limit || 50, 1), 250);
    const cursor = args.cursor || undefined;

    let gqlQuery: string;
    let variables: Record<string, unknown> | undefined = undefined;

    if (rawQuery && (/^\s*query\b/i.test(rawQuery) || /^\s*\{/i.test(rawQuery))) {
      gqlQuery = rawQuery;
    } else {
      gqlQuery = `
        query FetchCollections($first: Int!, $query: String, $after: String) {
          collections(first: $first, query: $query, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                handle
                description
                productsCount {
                  count
                }
                image {
                  url
                  altText
                }
                rules {
                  column
                  relation
                  condition
                }
              }
            }
          }
        }
      `;
      variables = {
        first: limit,
        query: rawQuery || undefined,
        after: cursor,
      };
    }

    const result = await executeShopifyGraphQuery({
      context: { userId },
      params: {
        query: gqlQuery,
        variables,
      },
    });

    if (!result.success) {
      throw new Error(
        `Shopify GraphQL collections query failed: ${result.error || "Unknown error"}`,
      );
    }

    const data = result.data as {
      collections?: {
        pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        edges?: Array<{ node: Record<string, any> }>;
      };
      [key: string]: any;
    };

    if (data?.collections?.edges) {
      const edges = data.collections.edges;
      const pageInfo = data.collections.pageInfo;
      const count = edges.length;

      const lines = [
        `### Shopify Collections (${count} retrieved)${rawQuery ? ` matching "${rawQuery}"` : ""}:\n`,
      ];

      for (const edge of edges) {
        const c = edge.node;
        const prodCount = c.productsCount?.count ?? "N/A";
        const ruleCount = c.rules?.length ?? 0;
        const typeStr = ruleCount > 0 ? "Smart Collection" : "Custom Collection";

        lines.push(
          `- **${c.title}** (\`${c.id}\`)\n` +
            `  Handle: \`${c.handle}\` | Type: ${typeStr} | Products: ${prodCount}\n` +
            (c.description
              ? `  Description: ${c.description.slice(0, 150)}\n`
              : "") +
            (c.image?.url ? `  Image: ${c.image.url}\n` : ""),
        );
      }

      if (pageInfo?.hasNextPage && pageInfo.endCursor) {
        lines.push(
          `\n*More collections available.* Next cursor: \`${pageInfo.endCursor}\``,
        );
      }

      return {
        summary: lines.join("\n"),
        count,
      };
    }

    return {
      summary: `### Shopify GraphQL Response:\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
      count: 1,
    };
  },
});
