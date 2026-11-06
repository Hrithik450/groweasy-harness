import {
  upsertConnector,
  getConnectorByUserIdAndProviderSlug,
} from "@openai-harness/connector";
import type { Connector } from "@openai-harness/connector";
import {
  ConnectorOutput,
  ConnectorInput,
  connectorSuccess,
  connectorError,
} from "@openai-harness/connector";
import {
  DEFAULT_SHOPIFY_API_VERSION,
  SHOPIFY_REQUIRED_SCOPES,
} from "./constants";
import {
  ShopifyShopDetails,
  ShopifyProduct,
  ShopifyVariant,
  ShopifyCollection,
  FetchShopifyProductsParams,
  FetchShopifyProductsResult,
  FetchShopifyCollectionsParams,
  ExecuteShopifyGraphQueryParams,
  validateShopifyConnector,
} from "./types";

/**
 * Normalizes and sanitizes user-entered shop string into a canonical `.myshopify.com` domain.
 */
export function sanitizeShopDomain(shop: string): string {
  let cleaned = shop.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//, "");
  cleaned = cleaned.replace(/\/.*$/, "");
  if (!cleaned.endsWith(".myshopify.com")) {
    cleaned = `${cleaned}.myshopify.com`;
  }
  return cleaned;
}

/**
 * Resolves access token and store domain from explicit overrides or from the user's active SQLite connector record.
 */
export async function resolveShopifyCredentials(
  input: ConnectorInput<unknown>,
): Promise<ConnectorOutput<{ shopDomain: string; token: string }>> {
  const { context, params } = input;
  const userId = context.userId;

  if (!userId) {
    return connectorError("User authentication required.", "AUTH_REQUIRED");
  }

  const connectorRes = await getConnectorByUserIdAndProviderSlug(
    userId,
    "shopify",
  );
  const connector = connectorRes?.data;

  const token = (context.accessToken || connector?.accessToken)?.trim();
  const rawParams = (params as Record<string, unknown>) || {};
  const meta = (connector?.metadata as Record<string, unknown>) || {};
  const rawShop =
    (rawParams.shop as string | undefined) ||
    (meta.shop as string | undefined) ||
    (meta.myshopifyDomain as string | undefined);

  if (!token) {
    return connectorError(
      "Shopify is not connected. Please connect your store first.",
      "AUTH_REQUIRED",
    );
  }

  if (!rawShop) {
    return connectorError(
      "No Shopify store domain found for this connection.",
      "INVALID_INPUT",
    );
  }

  return connectorSuccess({
    shopDomain: sanitizeShopDomain(rawShop),
    token,
  });
}

/**
 * Verifies a Shopify access token by fetching store identity from the Shopify Admin API.
 */
export async function verifyShopifyToken(
  shopDomain: string,
  token: string,
): Promise<ConnectorOutput<ShopifyShopDetails>> {
  if (!shopDomain) {
    return connectorError("Shop domain is required.", "INVALID_INPUT");
  }
  if (!token) {
    return connectorError("Shopify access token is required.", "AUTH_REQUIRED");
  }

  const cleanShop = sanitizeShopDomain(shopDomain);
  const graphqlEndpoint = `https://${cleanShop}/admin/api/${DEFAULT_SHOPIFY_API_VERSION}/graphql.json`;

  const query = `
    query GetShopDetails {
      shop {
        id
        name
        myshopifyDomain
        currencyCode
        email
        contactEmail
        plan {
          displayName
        }
        billingAddress {
          countryCodeV2
        }
        primaryDomain {
          url
          host
        }
      }
    }
  `;

  try {
    const res = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return connectorError(
          "Invalid or expired Shopify access token.",
          "TOKEN_EXPIRED",
        );
      }
      return connectorError(
        `Shopify API error: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    const json = (await res.json()) as {
      data?: {
        shop?: {
          id: string;
          name: string;
          myshopifyDomain: string;
          currencyCode: string;
          email?: string | null;
          contactEmail?: string | null;
          plan?: { displayName?: string | null };
          billingAddress?: { countryCodeV2?: string | null };
          primaryDomain?: { url?: string | null; host?: string | null };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (json.errors && json.errors.length > 0) {
      const msg = json.errors.map((e) => e.message).join(", ");
      return connectorError(msg, "UPSTREAM_ERROR");
    }

    const shop = json.data?.shop;
    if (!shop) {
      return connectorError(
        "Could not retrieve shop details from Shopify.",
        "ACCOUNT_NOT_FOUND",
      );
    }

    const host = shop.primaryDomain?.host?.trim() || cleanShop;
    const primaryDomainUrl =
      shop.primaryDomain?.url?.trim() ||
      (host
        ? host.startsWith("http")
          ? host
          : `https://${host}`
        : `https://${cleanShop}`);

    return connectorSuccess<ShopifyShopDetails>({
      id: shop.id,
      name: shop.name || cleanShop.replace(/\.myshopify\.com$/, ""),
      myshopifyDomain: shop.myshopifyDomain || cleanShop,
      currencyCode: shop.currencyCode || "USD",
      email: shop.email,
      contactEmail: shop.contactEmail,
      domain: host,
      planName: shop.plan?.displayName || null,
      countryCode: shop.billingAddress?.countryCodeV2 || null,
      primaryDomainUrl,
    });
  } catch (err) {
    try {
      const restEndpoint = `https://${cleanShop}/admin/api/${DEFAULT_SHOPIFY_API_VERSION}/shop.json`;
      const restRes = await fetch(restEndpoint, {
        headers: {
          Accept: "application/json",
          "X-Shopify-Access-Token": token,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (restRes.ok) {
        const restJson = (await restRes.json()) as {
          shop?: {
            id: number;
            name: string;
            email?: string;
            domain?: string;
            myshopify_domain?: string;
            currency?: string;
            plan_name?: string;
            country_code?: string;
          };
        };
        const s = restJson.shop;
        if (s) {
          return connectorSuccess<ShopifyShopDetails>({
            id: String(s.id),
            name: s.name || cleanShop.replace(/\.myshopify\.com$/, ""),
            myshopifyDomain: s.myshopify_domain || cleanShop,
            currencyCode: s.currency || "USD",
            email: s.email,
            domain: s.domain || cleanShop,
            planName: s.plan_name,
            countryCode: s.country_code,
            primaryDomainUrl: s.domain
              ? `https://${s.domain}`
              : `https://${cleanShop}`,
          });
        }
      }
    } catch {
    }

    return connectorError(
      err instanceof Error ? err.message : "Failed to connect to Shopify API",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Synchronizes the Shopify connection state in the SQLite database.
 */
export async function syncShopifyConnector(
  input: ConnectorInput<{ shop?: string }>,
): Promise<ConnectorOutput<Connector | null>> {
  const { context, params } = input;
  const userId = context.userId;

  const existingRes = await getConnectorByUserIdAndProviderSlug(
    userId,
    "shopify",
  );
  const existing = existingRes.data;

  const token = context.accessToken?.trim() ?? existing?.accessToken;
  const existingMeta = (existing?.metadata as Record<string, unknown>) || {};
  const rawShop =
    params?.shop ||
    (existingMeta.shop as string | undefined) ||
    (existingMeta.myshopifyDomain as string | undefined);

  if (!token || !rawShop) {
    const updated = await upsertConnector({
      userId,
      slug: "shopify",
      providerSlug: "shopify",
      status: "disconnected",
      accessToken: null,
      metadata: null,
      permissions: null,
    });
    return connectorSuccess<Connector | null>(updated.data || null);
  }

  const shopDomain = sanitizeShopDomain(rawShop);

  const verification = await verifyShopifyToken(shopDomain, token);

  if (!verification.success || !verification.data) {
    await upsertConnector({
      userId,
      slug: "shopify",
      providerSlug: "shopify",
      status: "disconnected",
      accessToken: token,
      metadata: {
        error: verification.error?.message || "Verification failed",
        shop: shopDomain,
      },
    });
    return connectorError(
      verification.error?.message || "Shopify token verification failed",
      verification.error?.code || "AUTH_REQUIRED",
    );
  }

  const shopDetails = verification.data;

  const metadataToInsert = validateShopifyConnector({
    shop: shopDetails.myshopifyDomain,
    name: shopDetails.name,
    currencyCode: shopDetails.currencyCode,
    email: shopDetails.email,
    contactEmail: shopDetails.contactEmail,
    domain: shopDetails.domain,
    planName: shopDetails.planName,
    countryCode: shopDetails.countryCode,
    primaryDomainUrl: shopDetails.primaryDomainUrl,
    connectedAt: new Date().toISOString(),
  });

  const updated = await upsertConnector({
    userId,
    slug: "shopify",
    providerSlug: "shopify",
    status: "connected",
    accessToken: token,
    permissions: [...SHOPIFY_REQUIRED_SCOPES],
    metadata: metadataToInsert,
  });

  return connectorSuccess<Connector | null>(updated.data || null);
}

/**
 * Fetches products from the connected Shopify store with optional search, collection, and status filters.
 */
export async function fetchShopifyProducts(
  input: ConnectorInput<FetchShopifyProductsParams>,
): Promise<ConnectorOutput<FetchShopifyProductsResult>> {
  const credsRes = await resolveShopifyCredentials(input);
  if (!credsRes.success || !credsRes.data) {
    return connectorError(
      credsRes.error?.message || "Failed to resolve Shopify credentials",
      credsRes.error?.code || "AUTH_REQUIRED",
    );
  }

  const { shopDomain, token } = credsRes.data;
  const params = input.params || {};
  const limit = Math.min(Math.max(params.limit || 10, 1), 100);

  const queryParts: string[] = [];

  if (params.status && params.status !== "ALL") {
    queryParts.push(`status:${params.status.toLowerCase()}`);
  }

  if (params.collectionId && params.collectionId.trim()) {
    const cleanColId = params.collectionId
      .trim()
      .replace(/^gid:\/\/shopify\/Collection\//, "");
    queryParts.push(`collection_id:${cleanColId}`);
  }

  if (params.query && params.query.trim()) {
    const cleanText = params.query.trim().replace(/['"]/g, "");
    queryParts.push(
      `(title:*${cleanText}* OR tag:*${cleanText}* OR vendor:*${cleanText}*)`,
    );
  }

  const queryString = queryParts.join(" AND ");

  const gql = `
    query FetchProducts($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query) {
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
            updatedAt
            featuredImage {
              url
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
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  availableForSale
                  inventoryQuantity
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const graphqlEndpoint = `https://${shopDomain}/admin/api/${DEFAULT_SHOPIFY_API_VERSION}/graphql.json`;
    const res = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: gql,
        variables: {
          first: limit,
          after: params.cursor || null,
          query: queryString || null,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return connectorError(
          "Shopify authorization expired.",
          "TOKEN_EXPIRED",
        );
      }
      return connectorError(
        `Shopify API error: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    const json = (await res.json()) as {
      data?: {
        products?: {
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
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
              featuredImage?: { url?: string } | null;
              priceRangeV2?: {
                minVariantPrice?: { amount: string; currencyCode: string };
                maxVariantPrice?: { amount: string; currencyCode: string };
              };
              variants?: {
                edges?: Array<{
                  node: {
                    id: string;
                    title: string;
                    sku?: string | null;
                    price: string;
                    compareAtPrice?: string | null;
                    availableForSale?: boolean;
                    inventoryQuantity?: number | null;
                    selectedOptions?: Array<{ name: string; value: string }>;
                  };
                }>;
              };
              updatedAt?: string;
            };
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      return connectorError(json.errors[0].message, "UPSTREAM_ERROR");
    }

    const data = json.data?.products;
    const edges = data?.edges || [];

    const products: ShopifyProduct[] = edges.map((edge) => {
      const node = edge.node;
      const variantNodes = (node.variants?.edges || []).map((v) => v.node);

      const variants: ShopifyVariant[] = variantNodes.map((v) => ({
        id: v.id,
        title: v.title,
        sku: v.sku || null,
        price: v.price,
        compareAtPrice: v.compareAtPrice || null,
        availableForSale: Boolean(v.availableForSale),
        inventoryQuantity: v.inventoryQuantity ?? null,
        selectedOptions: v.selectedOptions || [],
      }));

      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        description: node.description || "",
        vendor: node.vendor || "",
        productType: node.productType || "",
        status: node.status || "ACTIVE",
        featuredImageUrl: node.featuredImage?.url || null,
        priceRange: {
          minVariantPrice: node.priceRangeV2?.minVariantPrice || {
            amount: "0.00",
            currencyCode: "USD",
          },
          maxVariantPrice: node.priceRangeV2?.maxVariantPrice,
        },
        totalInventory: node.totalInventory ?? null,
        tags: Array.isArray(node.tags) ? node.tags : [],
        variantsCount: variants.length,
        variants,
        onlineStoreUrl: node.onlineStoreUrl || null,
        updatedAt: node.updatedAt,
      };
    });

    return connectorSuccess<FetchShopifyProductsResult>({
      products,
      pageInfo: {
        hasNextPage: Boolean(data?.pageInfo?.hasNextPage),
        endCursor: data?.pageInfo?.endCursor || null,
      },
    });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Failed to fetch Shopify products",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Fetches collections from the connected Shopify store for category filtering.
 */
export async function fetchShopifyCollections(
  input: ConnectorInput<FetchShopifyCollectionsParams>,
): Promise<ConnectorOutput<ShopifyCollection[]>> {
  const credsRes = await resolveShopifyCredentials(input);
  if (!credsRes.success || !credsRes.data) {
    return connectorError(
      credsRes.error?.message || "Failed to resolve Shopify credentials",
      credsRes.error?.code || "AUTH_REQUIRED",
    );
  }

  const { shopDomain, token } = credsRes.data;
  const limit = Math.min(Math.max(input.params?.limit || 50, 1), 100);

  const gql = `
    query FetchCollections($first: Int!) {
      collections(first: $first) {
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
            }
          }
        }
      }
    }
  `;

  try {
    const graphqlEndpoint = `https://${shopDomain}/admin/api/${DEFAULT_SHOPIFY_API_VERSION}/graphql.json`;
    const res = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: gql,
        variables: { first: limit },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return connectorError(
          "Shopify authorization expired.",
          "TOKEN_EXPIRED",
        );
      }
      return connectorError(
        `Shopify API error: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    const json = (await res.json()) as {
      data?: {
        collections?: {
          edges?: Array<{
            node: {
              id: string;
              title: string;
              handle: string;
              description?: string | null;
              productsCount?: { count: number };
              image?: { url: string } | null;
            };
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      return connectorError(json.errors[0].message, "UPSTREAM_ERROR");
    }

    const edges = json.data?.collections?.edges || [];
    const collections: ShopifyCollection[] = edges.map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      description: edge.node.description || null,
      productsCount: edge.node.productsCount?.count ?? 0,
      imageUrl: edge.node.image?.url || null,
    }));

    return connectorSuccess<ShopifyCollection[]>(collections);
  } catch (err) {
    return connectorError(
      err instanceof Error
        ? err.message
        : "Failed to fetch Shopify collections",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Fetches full details for a single product by Shopify GID.
 */
export async function fetchShopifyProductById(
  input: ConnectorInput<{ id: string }>,
): Promise<ConnectorOutput<ShopifyProduct | null>> {
  const credsRes = await resolveShopifyCredentials(input);
  if (!credsRes.success || !credsRes.data) {
    return connectorError(
      credsRes.error?.message || "Failed to resolve Shopify credentials",
      credsRes.error?.code || "AUTH_REQUIRED",
    );
  }

  const { shopDomain, token } = credsRes.data;
  const productId = input.params?.id;

  if (!productId) {
    return connectorError("Product ID is required.", "INVALID_INPUT");
  }

  const cleanId = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const gql = `
    query GetProduct($id: ID!) {
      product(id: $id) {
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
        updatedAt
        featuredImage {
          url
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
        variants(first: 100) {
          edges {
            node {
              id
              title
              sku
              price
              compareAtPrice
              availableForSale
              inventoryQuantity
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }
  `;

  try {
    const graphqlEndpoint = `https://${shopDomain}/admin/api/${DEFAULT_SHOPIFY_API_VERSION}/graphql.json`;
    const res = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: gql,
        variables: { id: cleanId },
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return connectorError(
        `Shopify API error: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    const json = (await res.json()) as {
      data?: {
        product?: {
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
          featuredImage?: { url?: string } | null;
          priceRangeV2?: {
            minVariantPrice?: { amount: string; currencyCode: string };
            maxVariantPrice?: { amount: string; currencyCode: string };
          };
          variants?: {
            edges?: Array<{
              node: {
                id: string;
                title: string;
                sku?: string | null;
                price: string;
                compareAtPrice?: string | null;
                availableForSale?: boolean;
                inventoryQuantity?: number | null;
                selectedOptions?: Array<{ name: string; value: string }>;
              };
            }>;
          };
          updatedAt?: string;
        };
      };
      errors?: Array<{ message: string }>;
    };
    const node = json.data?.product;
    if (!node) {
      return connectorSuccess<ShopifyProduct | null>(null);
    }

    const variantNodes = (node.variants?.edges || []).map((v) => v.node);
    const variants: ShopifyVariant[] = variantNodes.map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku || null,
      price: v.price,
      compareAtPrice: v.compareAtPrice || null,
      availableForSale: Boolean(v.availableForSale),
      inventoryQuantity: v.inventoryQuantity ?? null,
      selectedOptions: v.selectedOptions || [],
    }));

    const product: ShopifyProduct = {
      id: node.id,
      title: node.title,
      handle: node.handle,
      description: node.description || "",
      vendor: node.vendor || "",
      productType: node.productType || "",
      status: node.status || "ACTIVE",
      featuredImageUrl: node.featuredImage?.url || null,
      priceRange: {
        minVariantPrice: node.priceRangeV2?.minVariantPrice || {
          amount: "0.00",
          currencyCode: "USD",
        },
        maxVariantPrice: node.priceRangeV2?.maxVariantPrice,
      },
      totalInventory: node.totalInventory ?? null,
      tags: Array.isArray(node.tags) ? node.tags : [],
      variantsCount: variants.length,
      variants,
      onlineStoreUrl: node.onlineStoreUrl || null,
      updatedAt: node.updatedAt,
    };

    return connectorSuccess<ShopifyProduct | null>(product);
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Failed to fetch Shopify product",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Universal Shopify Admin GraphQL query executor (read-only).
 * Resolves shop domain and token securely from the connected connector record and dispatches queries.
 * Enforces strict read-only execution (mutations are prohibited).
 */
export async function executeShopifyGraphQuery(
  input: ConnectorInput<ExecuteShopifyGraphQueryParams>,
): Promise<ConnectorOutput<Record<string, unknown>>> {
  const credsRes = await resolveShopifyCredentials(input);
  if (!credsRes.success || !credsRes.data) {
    return connectorError(
      credsRes.error?.message ||
        "Shopify connector is not connected. Missing credentials.",
      credsRes.error?.code || "AUTH_REQUIRED",
    );
  }

  const { shopDomain, token } = credsRes.data;
  const rawQuery = input.params?.query?.trim();

  if (!rawQuery) {
    return connectorError(
      "A GraphQL query string is required.",
      "INVALID_INPUT",
    );
  }

  if (/^\s*mutation\b/i.test(rawQuery) || /\bmutation\s*\{/i.test(rawQuery)) {
    return connectorError(
      "Only read-only GraphQL queries are permitted. Mutations are prohibited.",
      "PERMISSION_DENIED",
    );
  }

  const cleanShop = sanitizeShopDomain(shopDomain);
  const graphqlEndpoint = `https://${cleanShop}/admin/api/${DEFAULT_SHOPIFY_API_VERSION}/graphql.json`;

  try {
    const res = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: rawQuery,
        variables: input.params?.variables,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return connectorError(
          "Shopify authorization expired.",
          "TOKEN_EXPIRED",
        );
      }
      return connectorError(
        `Shopify API error: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    const json = (await res.json()) as {
      data?: Record<string, unknown>;
      errors?: Array<{ message: string }>;
    };

    if (json.errors && json.errors.length > 0) {
      const errorMsg = json.errors.map((e) => e.message).join("; ");
      return connectorError(
        `Shopify GraphQL error: ${errorMsg}`,
        "UPSTREAM_ERROR",
      );
    }

    return connectorSuccess<Record<string, unknown>>(json.data || {});
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Failed to execute Shopify GraphQL query";
    return connectorError(msg, "NETWORK_ERROR");
  }
}
