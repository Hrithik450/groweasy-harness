import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getPublicOrigin } from "@/lib/auth/public.origin";
import {
  buildShopifyOAuthLoginUrl,
  isShopifyOAuthConfigured,
} from "@/lib/auth/shopify";

/**
 * GET /api/auth/shopify/login
 *
 * Starts the Shopify OAuth hop. The store name arrives as `shop`; `returnTo`
 * is where the callback lands afterwards. Both are carried through Shopify in
 * the `state` parameter, so the callback never has to trust anything else.
 */
export async function GET(req: NextRequest) {
  const origin = getPublicOrigin(req);
  const shop = req.nextUrl.searchParams.get("shop")?.trim() ?? "";
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/c";
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/c";
  const separator = safeReturnTo.includes("?") ? "&" : "?";

  const user = await getSessionFromRequest(req);
  if (!user?.id) {
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent(
          "Please sign in before connecting your Shopify store.",
        )}`,
        origin,
      ),
    );
  }

  if (!shop) {
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent(
          "A Shopify store name is required.",
        )}`,
        origin,
      ),
    );
  }

  if (!isShopifyOAuthConfigured()) {
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent(
          "Shopify integration is currently unavailable. Please contact support or try again later.",
        )}`,
        origin,
      ),
    );
  }

  try {
    const url = buildShopifyOAuthLoginUrl({
      shop,
      origin,
      state: safeReturnTo,
    });
    return NextResponse.redirect(url);
  } catch (err: unknown) {
    console.error("[Shopify OAuth Login Error]", err);
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent(
          "Unable to start Shopify authentication. Please try again or contact support.",
        )}`,
        origin,
      ),
    );
  }
}
