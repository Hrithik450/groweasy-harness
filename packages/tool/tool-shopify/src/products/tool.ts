import type { Session } from "@openai-harness/session";
import { executeShopifyGraphQuery } from "@openai-harness/connector-shopify";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface FetchShopifyProductsArgs {
  query?: string;
  limit?: number;
  cursor?: string;
}

export const fetchShopifyProductsTool = defineTool({
  name: "fetchShopifyProducts",
  description:
    "Fetch catalog products, pricing, inventory, variants, tags, images, and collections from the connected Shopify store using free-form Shopify Admin GraphQL queries (2025-01).",
  timeoutMs: 30000,
  isConcurrencySafe: () => true,
  parameters: {
    query: {
      type: "string",
      description:
        "Free-form GraphQL query string to execute against Shopify Admin GraphQL API (or product search filter, e.g. 'status:active', 'tag:bestseller'). If omitted or passed as a search filter, a standard products query is executed.",
    },
    limit: {
      type: "number",
      description:
        "Optional maximum number of products to return (default 10, max 250).",
    },
    cursor: {
      type: "string",
      description:
        "Optional pagination cursor to fetch the next page of products.",
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
    title: `Fetch Shopify products${args.query ? ` (${args.query})` : ""}`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "fetch",
    title: `Shopify products fetched (${(result.meta as any)?.count ?? 0} products)`,
    content: result.content,
  }),
  async execute(args, exec) {
    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error(
        "User authentication context required to fetch Shopify products.",
      );
    }

    const rawQuery = args.query?.trim();
    const limit = Math.min(Math.max(args.limit || 10, 1), 250);
    const cursor = args.cursor || undefined;

    let gqlQuery: string;
    let variables: Record<string, unknown> | undefined = undefined;

    if (rawQuery && (/^\s*query\b/i.test(rawQuery) || /^\s*\{/i.test(rawQuery))) {
      gqlQuery = rawQuery;
    } else {
      gqlQuery = `
        query FetchProducts($first: Int!, $query: String, $after: String) {
          products(first: $first, query: $query, after: $after) {
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
                vendor
                productType
                status
                totalInventory
                tags
                onlineStoreUrl
                featuredImage {
                  url
                  altText
                }
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                  maxVariantPrice {
                    amount
                    currencyCode
                  }
                }
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      compareAtPrice
                      availableForSale
                      inventoryQuantity
                    }
                  }
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
        `Shopify GraphQL query failed: ${result.error || "Unknown error"}`,
      );
    }

    const data = result.data as {
      products?: {
        pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        edges?: Array<{ node: Record<string, any> }>;
      };
      [key: string]: any;
    };

    if (data?.products?.edges) {
      const edges = data.products.edges;
      const pageInfo = data.products.pageInfo;
      const count = edges.length;

      const lines = [
        `### Shopify Products (${count} retrieved)${rawQuery ? ` matching "${rawQuery}"` : ""}:\n`,
      ];

      for (const edge of edges) {
        const p = edge.node;
        const minPrice = p.priceRangeV2?.minVariantPrice;
        const priceStr = minPrice
          ? `${minPrice.currencyCode} ${minPrice.amount}`
          : "N/A";
        const invStr =
          p.totalInventory !== undefined
            ? ` | Inventory: ${p.totalInventory}`
            : "";
        const variantsCount = p.variants?.edges?.length ?? 0;

        lines.push(
          `- **${p.title}** (\`${p.id}\`)\n` +
            `  Status: ${p.status} | Price: ${priceStr}${invStr} | Vendor: ${p.vendor || "N/A"} | Type: ${p.productType || "N/A"}\n` +
            `  Handle: \`${p.handle}\` | Variants: ${variantsCount}\n` +
            (p.tags?.length ? `  Tags: ${p.tags.join(", ")}\n` : "") +
            (p.featuredImage?.url
              ? `  Featured Image: ${p.featuredImage.url}\n`
              : "") +
            (p.onlineStoreUrl ? `  Store URL: ${p.onlineStoreUrl}\n` : ""),
        );
      }

      if (pageInfo?.hasNextPage && pageInfo.endCursor) {
        lines.push(
          `\n*More products available.* Next cursor: \`${pageInfo.endCursor}\``,
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
