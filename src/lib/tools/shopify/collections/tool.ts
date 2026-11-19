import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { executeShopifyGraphQuery } from "@/lib/connectors/shopify";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const fetchShopifyCollectionsToolDefinition = {
  type: "function" as const,
  name: "fetchShopifyCollections",
  description:
    "Fetch product collections, categories, smart collections, and rules from the connected Shopify store using free-form Shopify Admin GraphQL queries (2025-01).\n\n" +
    "Target Endpoint: `POST /admin/api/2025-01/graphql.json` (Shopify Admin GraphQL API)\n\n" +
    "Supported Query Arguments on `collections(...)`:\n" +
    "- `first`: Int (number of collections to return, e.g. 25, 50, up to 250)\n" +
    "- `after`: String (cursor pagination token from `pageInfo.endCursor`)\n" +
    "- `query`: Free-form search filter string. Examples:\n" +
    '  - By title: `query: "title:*summer*"`\n' +
    '  - By collection type: `query: "collection_type:smart"` or `query: "collection_type:custom"`\n' +
    "- `sortKey`: `TITLE`, `UPDATED_AT`, `RELEVANCE`, `ID`\n" +
    "- `reverse`: Boolean\n\n" +
    "Standard Read-Only GraphQL Query Example:\n" +
    "```graphql\n" +
    "query GetCollections($first: Int = 50) {\n" +
    "  collections(first: $first) {\n" +
    "    pageInfo { hasNextPage endCursor }\n" +
    "    edges {\n" +
    "      node {\n" +
    "        id\n" +
    "        title\n" +
    "        handle\n" +
    "        description\n" +
    "        productsCount { count }\n" +
    "        image { url altText }\n" +
    "        rules { column relation condition }\n" +
    "      }\n" +
    "    }\n" +
    "  }\n" +
    "}\n" +
    "```\n\n" +
    "Official Shopify GraphQL Reference & Docs:\n" +
    "- Collections Query: https://shopify.dev/docs/api/admin-graphql/latest/queries/collections\n\n" +
    "Security & Permissions: Strictly READ-ONLY. Mutations are prohibited. Authentication tokens are injected securely on the backend.",
  parameters: {
    type: "object",
    properties: {
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
  },
};

export interface FetchShopifyCollectionsArgs {
  query?: string;
  limit?: number;
  cursor?: string;
}

export async function executeFetchShopifyCollectionsTool(
  input: ToolInput<FetchShopifyCollectionsArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    const errorMsg =
      "User authentication context required to fetch Shopify collections.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const rawQuery = input.args?.query?.trim();
  const limit = Math.min(Math.max(input.args?.limit || 50, 1), 250);
  const cursor = input.args?.cursor || undefined;

  let gqlQuery: string;
  let variables: Record<string, unknown> | undefined = undefined;

  // Check if caller supplied a full GraphQL query document
  if (rawQuery && (/^\s*query\b/i.test(rawQuery) || /^\s*\{/i.test(rawQuery))) {
    gqlQuery = rawQuery;
  } else {
    // Construct standard read-only GraphQL query for collections
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

  const res = await executeShopifyGraphQuery({
    params: {
      query: gqlQuery,
      variables,
    },
    context: {
      userId,
      providerSlug: "shopify",
    },
  });

  if (!res.success || !res.data) {
    const errorMsg =
      res.error?.message || "Failed to query Shopify collections.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const data = res.data;
  const collectionsObj = data.collections as
    | {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        edges?: Array<{
          node: {
            id: string;
            title: string;
            handle: string;
            description?: string | null;
            productsCount?: { count: number };
            image?: { url: string; altText?: string | null } | null;
            rules?: Array<{
              column: string;
              relation: string;
              condition: string;
            }>;
          };
        }>;
      }
    | undefined;

  if (collectionsObj && Array.isArray(collectionsObj.edges)) {
    const edges = collectionsObj.edges;
    let text = `### Shopify Collections (${edges.length} retrieved)\n\n`;

    if (edges.length === 0) {
      text += `No collections found matching the query.\n`;
    } else {
      for (const { node } of edges) {
        const count = node.productsCount?.count ?? 0;
        text += `- **${node.title}** (\`${node.id}\`)\n`;
        text += `  - **Handle**: \`${node.handle}\` · **Products**: ${count}\n`;
        if (node.description) {
          text += `  - **Description**: ${node.description.trim()}\n`;
        }
        if (node.image?.url) {
          text += `  - **Image**: ${node.image.url}\n`;
        }
        if (node.rules && node.rules.length > 0) {
          const rulesStr = node.rules
            .map((r) => `${r.column} ${r.relation} "${r.condition}"`)
            .join(", ");
          text += `  - **Rules**: ${rulesStr}\n`;
        }
        text += `\n`;
      }
    }

    if (collectionsObj.pageInfo?.hasNextPage) {
      text += `*More collections available. Use cursor: \`${collectionsObj.pageInfo.endCursor}\` to fetch next page.*\n`;
    }

    return {
      success: true,
      data: {
        contentParts: [{ type: "input_text", text }],
      },
    };
  }

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `### Shopify Collections Query Result\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
        },
      ],
    },
  };
}
