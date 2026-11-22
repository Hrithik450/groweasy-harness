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

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value;
  let userValid = false;

  if (token) {
    const verified = await verifyAuthSession(token);
    if (verified?.id) {
      const userRes = await getUserByUserId(verified.id);
      if (userRes.success && userRes.data) {
        userValid = true;
      }
    }
  }

  if (userValid) {
    return NextResponse.next();
  }

  const anonRes = await createAnonymousUser();
  if (!anonRes.success || !anonRes.data) {
    return NextResponse.next();
  }

  const user = anonRes.data;
  const newToken = await createAuthSession(user);

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
