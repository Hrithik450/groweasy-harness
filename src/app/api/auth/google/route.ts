import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE_NAME,
  attachAuthSession,
  getAuthSessionFromRequest,
} from "@/lib/auth/session";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { rebindUserWithGoogle } from "@/lib/services";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthSessionFromRequest(req);

    if (!user) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    const res = NextResponse.json({ success: true, user });

    // Only attach the cookie if it was missing from the request (e.g. recovered via fallback header)
    const hasCookie = Boolean(req.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value);
    if (!hasCookie) {
      return await attachAuthSession(res, user);
    }

    return res;
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch session",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    let credential: string | undefined;

    // Support both application/x-www-form-urlencoded and JSON
    const params = new URLSearchParams(raw);
    credential = params.get("credential") ?? undefined;

    if (!credential) {
      try {
        const json = JSON.parse(raw) as Record<string, unknown>;
        if (typeof json.credential === "string") credential = json.credential;
      } catch {
        // Not JSON
      }
    }

    if (!credential) {
      return NextResponse.json(
        { success: false, error: "Missing Google ID token credential." },
        { status: 400 },
      );
    }

    // Verify token using google-auth-library
    const identity = await verifyGoogleIdToken(credential);

    if (!identity.emailVerified) {
      return NextResponse.json(
        { success: false, error: "Google email is not verified." },
        { status: 400 },
      );
    }

    const currentUser = await getAuthSessionFromRequest(req);
    const anonymousUserId =
      currentUser && !currentUser.googleId ? currentUser.id : undefined;

    const userRes = await rebindUserWithGoogle({
      id: anonymousUserId,
      googleId: identity.googleId,
      email: identity.email,
      name: identity.name,
      picture: identity.picture,
      emailVerified: identity.emailVerified,
    });

    if (!userRes.success || !userRes.data) {
      throw new Error(userRes.error || "Failed to authenticate user");
    }

    const user = userRes.data;

    const response = NextResponse.json({
      success: true,
      user,
    });

    return await attachAuthSession(response, user);
  } catch (error: unknown) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_")) {
      throw error;
    }
    const message =
      error instanceof Error
        ? error.message
        : "Internal server error during Google login";
    console.error("[Google Auth Error]", error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
