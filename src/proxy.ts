import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_SESSION_COOKIE_NAME,
  authSessionCookieOptions,
  createAuthSession,
  verifyAuthSession,
} from "@/lib/auth";
import {
  createAnonymousUser,
  getUserByUserId,
} from "@/lib/services/users.service";
import { getDefaultSession } from "@/lib/services/sessions.service";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value;
  const verified = token ? await verifyAuthSession(token) : null;
  const existingRes = verified?.id
    ? await getUserByUserId(verified.id)
    : null;
  let user = existingRes?.success ? existingRes.data : null;

  let newToken: string | null = null;
  if (!user) {
    const anonRes = await createAnonymousUser();
    if (!anonRes.success || !anonRes.data) return NextResponse.next();
    user = anonRes.data;
    newToken = await createAuthSession(user);
  }

  // `/c` lands on the user's default session. Done here rather than in the
  // page: with cache components the shell streams first, so a page redirect
  // can no longer send a real 3xx.
  if (request.nextUrl.pathname === "/c") {
    const sessionRes = await getDefaultSession(user.id);
    if (sessionRes.success && sessionRes.data) {
      const response = NextResponse.redirect(
        new URL(
          `/c/${sessionRes.data.id}${request.nextUrl.search}`,
          request.url,
        ),
      );
      if (newToken) {
        response.cookies.set(
          AUTH_SESSION_COOKIE_NAME,
          newToken,
          authSessionCookieOptions(),
        );
      }
      return response;
    }
  }

  if (!newToken) return NextResponse.next();

  const requestHeaders = new Headers(request.headers);
  const existingCookie = request.headers.get("cookie");
  const cookieEntry = `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(newToken)}`;
  requestHeaders.set(
    "cookie",
    existingCookie ? `${existingCookie}; ${cookieEntry}` : cookieEntry,
  );

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.cookies.set(
    AUTH_SESSION_COOKIE_NAME,
    newToken,
    authSessionCookieOptions(),
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)).*)",
  ],
};
