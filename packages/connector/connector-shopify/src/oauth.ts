import crypto from "crypto";
import { SHOPIFY_REQUIRED_SCOPES } from "./constants";
import { sanitizeShopDomain } from "./connector";

export function getShopifyClientId(): string | undefined {
  return process.env.SHOPIFY_CLIENT_ID?.trim() || undefined;
}

export function getShopifyClientSecret(): string | undefined {
  return process.env.SHOPIFY_CLIENT_SECRET?.trim() || undefined;
}

export function isShopifyOAuthConfigured(): boolean {
  return Boolean(getShopifyClientId() && getShopifyClientSecret());
}

export function getShopifyRedirectUri(origin: string): string {
  if (process.env.SHOPIFY_REDIRECT_URI?.trim()) {
    return process.env.SHOPIFY_REDIRECT_URI.trim();
  }
  return `${origin}/api/v1/integrations/shopify/callback`;
}

/**
 * Builds the official Shopify OAuth 2.0 authorization URL for a specific store.
 */
export function buildShopifyOAuthLoginUrl(options: {
  shop: string;
  origin: string;
  state?: string;
}): string {
  const clientId = getShopifyClientId();
  if (!clientId) {
    throw new Error(
      "SHOPIFY_CLIENT_ID is not configured in environment variables. Please configure SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.",
    );
  }

  const shopDomain = sanitizeShopDomain(options.shop);
  const redirectUri = getShopifyRedirectUri(options.origin);

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_REQUIRED_SCOPES.join(","),
    redirect_uri: redirectUri,
    state: options.state || "/",
  });

  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Validates the HMAC cryptographic signature sent by Shopify on redirect callbacks.
 */
export function verifyShopifyHmac(
  query: Record<string, string | string[] | undefined>,
): boolean {
  const clientSecret = getShopifyClientSecret();
  if (!clientSecret) return false;

  const { hmac, signature, ...rest } = query;
  if (!hmac || typeof hmac !== "string") {
    return false;
  }

  const sortedKeys = Object.keys(rest).sort();
  const message = sortedKeys
    .map((key) => {
      const val = rest[key];
      const strVal = Array.isArray(val) ? val.join(",") : String(val ?? "");
      return `${key}=${strVal}`;
    })
    .join("&");

  const calculatedHmac = crypto
    .createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "utf8"),
      Buffer.from(calculatedHmac, "utf8"),
    );
  } catch {
    return false;
  }
}

/**
 * Exchanges temporary Shopify authorization code for a permanent access token.
 */
export async function exchangeShopifyCodeForToken(options: {
  shop: string;
  code: string;
}): Promise<{ accessToken: string; scope: string }> {
  const clientId = getShopifyClientId();
  const clientSecret = getShopifyClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error(
      "SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET is not configured in environment variables.",
    );
  }

  const shopDomain = sanitizeShopDomain(options.shop);
  const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: options.code,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to exchange Shopify authorization code (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    scope: string;
  };

  return {
    accessToken: data.access_token,
    scope: data.scope,
  };
}
