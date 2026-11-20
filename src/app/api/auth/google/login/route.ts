import { NextRequest, NextResponse } from "next/server";
import { getGoogleOAuthLoginUrl } from "@/lib/auth/google";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getPublicOrigin } from "@/lib/auth/public.origin";

export async function GET(req: NextRequest) {
  const origin = getPublicOrigin(req);
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/c";

  try {
    const user = await getSessionFromRequest(req);
    const statePayload = {
      returnTo,
      anonymousUserId: user && !user.googleId ? user.id : undefined,
    };

    const state = Buffer.from(JSON.stringify(statePayload)).toString(
      "base64url",
    );
    const url = getGoogleOAuthLoginUrl(origin, state);
    return NextResponse.redirect(url);
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_")) {
      throw err;
    }
    console.error("[Google OAuth Login Error]", err);
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent("Unable to start Google sign-in. Please try again or contact support.")}`,
        req.url,
      ),
    );
  }
}
