import { NextRequest, NextResponse } from "next/server";
import { getAuthSessionFromRequest } from "@/lib/auth/session";
import { exchangeShopifyCodeForToken } from "@/lib/auth/shopify";
import {
  sanitizeShopDomain,
  syncShopifyConnector,
} from "@/lib/connectors/shopify";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const origin = req.nextUrl.origin;

  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state") ?? "/c";
  let safeReturnTo = "/c";

  if (state.startsWith("/")) {
    safeReturnTo = state;
  } else {
    try {
      const decoded = JSON.parse(
        Buffer.from(state, "base64url").toString("utf8"),
      );
      if (
        typeof decoded.returnTo === "string" &&
        decoded.returnTo.startsWith("/")
      ) {
        safeReturnTo = decoded.returnTo;
      }
    } catch {
      // Keep default
    }
  }

  const separator = safeReturnTo.includes("?") ? "&" : "?";

  if (error || !code || !shop) {
    const msg = error
      ? "Shopify connection cancelled."
      : "Missing Shopify authorization code.";
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent(msg)}`,
        origin,
      ),
    );
  }

  const user = await getAuthSessionFromRequest(req);
  if (!user?.id) {
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent("Please sign in before connecting Shopify.")}`,
        origin,
      ),
    );
  }

  try {
    const shopDomain = sanitizeShopDomain(shop);
    const { accessToken } = await exchangeShopifyCodeForToken({
      shop: shopDomain,
      code,
    });

    await syncShopifyConnector({
      context: { userId: user.id, providerSlug: "shopify", accessToken },
      params: { shop: shopDomain },
    });

    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}open_connector=shopify&shopify_connected=true`,
        origin,
      ),
    );
  } catch (err) {
    console.error("[Shopify OAuth Callback Error]", err);
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent("Failed to complete Shopify connection.")}`,
        origin,
      ),
    );
  }
}
