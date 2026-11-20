import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getMetaOAuthLoginUrl, isMetaOAuthConfigured } from "@/lib/auth/meta";
import { getPublicOrigin } from "@/lib/auth/public.origin";

export async function GET(req: NextRequest) {
  const origin = getPublicOrigin(req);
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/c";

  // Require user to be logged in to connect their Meta account
  const user = await getSessionFromRequest(req);
  if (!user?.id) {
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent("Please sign in before connecting your Meta Ads account.")}`,
        origin,
      ),
    );
  }

  if (!isMetaOAuthConfigured()) {
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent(
          "Meta Ads integration is currently unavailable. Please contact support or try again later.",
        )}`,
        origin,
      ),
    );
  }

  try {
    const url = getMetaOAuthLoginUrl(origin, returnTo);
    return NextResponse.redirect(url);
  } catch (err: unknown) {
    console.error("[Meta OAuth Login Error]", err);
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent("Unable to start Meta Ads authentication. Please try again or contact support.")}`,
        origin,
      ),
    );
  }
}
