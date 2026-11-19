import { rebindUserWithGoogle } from "@/lib/services";
import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCodeForUser } from "@/lib/auth/google";
import { attachSessionCookie, getSessionFromRequest } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  let redirectUrl = "/c";

  try {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");
    const stateParam = req.nextUrl.searchParams.get("state") ?? "/c";

    if (error) {
      const msg =
        error === "access_denied"
          ? "Google sign-in was cancelled."
          : "Google sign-in failed. Please try again.";
      return NextResponse.redirect(
        new URL(`/?error=${encodeURIComponent(msg)}`, req.url),
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL(
          `/?error=${encodeURIComponent("Authorization code was not received from Google. Please try again.")}`,
          req.url,
        ),
      );
    }

    let anonymousUserId: string | undefined = undefined;

    try {
      if (stateParam.startsWith("{") || stateParam.includes("%7B")) {
        const parsed = JSON.parse(decodeURIComponent(stateParam));
        redirectUrl = parsed.returnTo ?? "/c";
        anonymousUserId = parsed.anonymousUserId;
      } else {
        const decoded = Buffer.from(stateParam, "base64url").toString("utf-8");
        const parsed = JSON.parse(decoded);
        redirectUrl = parsed.returnTo ?? "/c";
        anonymousUserId = parsed.anonymousUserId;
      }
    } catch {
      redirectUrl = stateParam.startsWith("/") ? stateParam : "/c";
    }

    if (!anonymousUserId) {
      const currentUser = await getSessionFromRequest(req);
      if (currentUser && !currentUser.googleId) {
        anonymousUserId = currentUser.id;
      }
    }

    const origin = req.nextUrl.origin;
    const identity = await exchangeGoogleCodeForUser(code, origin);

    // Rebind existing anonymous user row in-place with Google identity
    const userRes = await rebindUserWithGoogle({
      id: anonymousUserId,
      googleId: identity.googleId,
      email: identity.email,
      name: identity.name,
      picture: identity.picture,
      emailVerified: identity.emailVerified,
    });

    if (!userRes.success || !userRes.data) {
      throw new Error(userRes.error || "Failed to authenticate with Google");
    }

    const user = userRes.data;
    const response = NextResponse.redirect(new URL(redirectUrl, req.url));
    return await attachSessionCookie(response, user);
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_")) {
      throw err;
    }
    console.error("[Google OAuth Callback Error]", err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to complete Google sign-in. Please try again or contact support.";
    const targetUrl = new URL(redirectUrl, req.url);
    targetUrl.searchParams.set("error", message);
    return NextResponse.redirect(targetUrl);
  }
}
