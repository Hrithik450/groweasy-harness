import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { executeShopifyGraphQuery } from "@/lib/connectors/shopify";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const fetchShopifyProductsToolDefinition = {
  type: "function" as const,
  name: "fetchShopifyProducts",
  description:
    "Fetch catalog products, pricing, inventory, variants, tags, images, and collections from the connected Shopify store using free-form Shopify Admin GraphQL queries (2025-01).\n\n" +
    "Target Endpoint: `POST /admin/api/2025-01/graphql.json` (Shopify Admin GraphQL API)\n\n" +
    "Supported Query Arguments on `products(...)`:\n" +
    "- `first`: Int (number of products to return, e.g. 10, 25, 50, up to 250)\n" +
    "- `after`: String (cursor pagination token from `pageInfo.endCursor`)\n" +
    "- `query`: Free-form search filter string. Examples:\n" +
    '  - Active products: `query: "status:active"`\n' +
    '  - By tag: `query: "tag:summer"`\n' +
    '  - By vendor: `query: "vendor:Nike"`\n' +
    '  - By collection: `query: "collection_id:123456789"`\n' +
    '  - By product type: `query: "product_type:Apparel"`\n' +
    '  - In stock only: `query: "inventory_total:>0"`\n' +
    '  - Multi-filter search: `query: "status:active tag:bestseller inventory_total:>0"`\n' +
    "- `sortKey`: `TITLE`, `PRODUCT_TYPE`, `VENDOR`, `UPDATED_AT`, `CREATED_AT`, `BEST_SELLING`, `PRICE`, `ID`\n" +
    "- `reverse`: Boolean (true for descending, false for ascending)\n\n" +
    "Standard Read-Only GraphQL Query Example:\n" +
    "```graphql\n" +
    "query GetProducts($first: Int = 10, $query: String) {\n" +
    "  products(first: $first, query: $query) {\n" +
    "    pageInfo { hasNextPage endCursor }\n" +
    "    edges {\n" +
    "      node {\n" +
    "        id\n" +
    "        title\n" +
    "        handle\n" +
    "        description\n" +
    "        status\n" +
    "        vendor\n" +
    "        productType\n" +
    "        totalInventory\n" +
    "        tags\n" +
    "        onlineStoreUrl\n" +
    "        featuredImage { url altText }\n" +
    "        priceRangeV2 {\n" +
    "          minVariantPrice { amount currencyCode }\n" +
    "          maxVariantPrice { amount currencyCode }\n" +
    "        }\n" +
    "        variants(first: 20) {\n" +
    "          edges {\n" +
    "            node {\n" +
    "              id title sku price compareAtPrice availableForSale inventoryQuantity\n" +
    "            }\n" +
    "          }\n" +
    "        }\n" +
    "      }\n" +
    "    }\n" +
    "  }\n" +
    "}\n" +
    "```\n\n" +
    "Official Shopify GraphQL Reference & Docs:\n" +
    "- Products Query Reference: https://shopify.dev/docs/api/admin-graphql/latest/queries/products\n" +
    "- Search Filter Syntax: https://shopify.dev/docs/api/admin-graphql/latest/queries/products#argument-query\n\n" +
    "Security & Permissions: Strictly READ-ONLY. Mutations are prohibited. Authentication tokens are injected securely on the backend.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Free-form GraphQL query string to execute against Shopify Admin GraphQL API (or a Shopify product search filter like 'status:active tag:bestseller'). If omitted or passed as a search filter, a standard full product catalog query is automatically executed.",
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
  },
};

export interface FetchShopifyProductsArgs {
  query?: string;
  limit?: number;
  cursor?: string;
}

export async function executeFetchShopifyProductsTool(
  input: ToolInput<FetchShopifyProductsArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    const errorMsg =
      "User authentication context required to fetch Shopify products.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const rawQuery = input.args?.query?.trim();
  const limit = Math.min(Math.max(input.args?.limit || 10, 1), 250);
  const cursor = input.args?.cursor || undefined;

  let gqlQuery: string;
  let variables: Record<string, unknown> | undefined = undefined;

  // Check if caller supplied a full GraphQL query document
  if (rawQuery && (/^\s*query\b/i.test(rawQuery) || /^\s*\{/i.test(rawQuery))) {
    gqlQuery = rawQuery;
  } else {
    // Construct standard read-only GraphQL query with filter & pagination
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
              variants(first: 20) {
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
    const errorMsg = res.error?.message || "Failed to query Shopify products.";
    return {
      success: false,
      data: {
        contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
      },
      error: errorMsg,
    };
  }

  const data = res.data;
  const productsObj = data.products as
    | {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        edges?: Array<{
          node: {
            id: string;
            title: string;
            handle: string;
            description?: string;
            vendor?: string;
            productType?: string;
            status?: string;
            totalInventory?: number | null;
            tags?: string[];
            onlineStoreUrl?: string | null;
            featuredImage?: { url?: string; altText?: string } | null;
            priceRangeV2?: {
              minVariantPrice?: { amount: string; currencyCode: string };
              maxVariantPrice?: { amount: string; currencyCode: string };
            };
            variants?: {
              edges?: Array<{
                node: {
                  id: string;
                  title: string;
                  sku?: string;
                  price: string;
                  availableForSale?: boolean;
                  inventoryQuantity?: number | null;
                };
              }>;
            };
          };
        }>;
      }
    | undefined;

  if (productsObj && Array.isArray(productsObj.edges)) {
    const edges = productsObj.edges;
    let text = `### Shopify Products (${edges.length} retrieved)\n\n`;

    if (edges.length === 0) {
      text += `No products found matching the query.\n`;
    } else {
      for (const { node } of edges) {
        const minPrice = node.priceRangeV2?.minVariantPrice;
        const priceStr = minPrice
          ? `${minPrice.currencyCode} ${minPrice.amount}`
          : "N/A";
        const invStr =
          node.totalInventory !== null && node.totalInventory !== undefined
            ? `${node.totalInventory} in stock`
            : "Inventory unmanaged";
        const tagsStr =
          node.tags && node.tags.length > 0 ? node.tags.join(", ") : "None";

        text += `- **${node.title}** (${node.status || "ACTIVE"})\n`;
        text += `  - **ID**: \`${node.id}\`\n`;
        text += `  - **Price**: ${priceStr}\n`;
        text += `  - **Type / Vendor**: ${node.productType || "General"} · ${node.vendor || "Default"}\n`;
        text += `  - **Inventory**: ${invStr}\n`;
        text += `  - **Tags**: ${tagsStr}\n`;
        if (node.featuredImage?.url) {
          text += `  - **Image**: ${node.featuredImage.url}\n`;
        }
        if (node.onlineStoreUrl) {
          text += `  - **Store URL**: ${node.onlineStoreUrl}\n`;
        }
        if (node.description) {
          const cleanDesc = node.description
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 160);
          text += `  - **Description**: ${cleanDesc}${node.description.length > 160 ? "..." : ""}\n`;
        }
        text += `\n`;
      }
    }

    if (productsObj.pageInfo?.hasNextPage) {
      text += `*More products available. Use cursor: \`${productsObj.pageInfo.endCursor}\` to fetch next page.*\n`;
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
          text: `### Shopify GraphQL Query Result\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
        },
      ],
    },
  };
}
