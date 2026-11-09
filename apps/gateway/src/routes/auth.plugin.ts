/**
 * Authentication HTTP routes for the gateway host.
 *
 * These are the routes the Next application used to serve under
 * `src/app/api/auth/**`. The OAuth protocol halves stay framework-free in
 * `@/lib/auth/*` and `@openai-harness/google-account`; this plugin owns only
 * the transport: request parsing, the redirect responses, and the session
 * cookie.
 *
 * Cookie name and lifetime come from `@/lib/auth/token` and are unchanged:
 * `ads-easy-session`, seven days, `HttpOnly; SameSite=Lax; Path=/`, with
 * `Secure` in production.
 *
 * Mount with `await ctx.plugin(AuthRoutes)`. `static inject` guarantees the
 * `webServer` service exists before the constructor registers the routes.
 *
 * @module @openai-harness/gateway/routes/auth
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { Context } from "@deepseek-ai/cordis";
import type { WebRoute } from "@openai-harness/host-webserver";
import { exchangeGoogleCodeForUser, getGoogleOAuthLoginUrl } from "@openai-harness/google-account";
import {
  exchangeMetaCodeForToken,
  getMetaOAuthLoginUrl,
  isMetaOAuthConfigured,
  syncMetaConnector,
} from "@openai-harness/connector-meta";
import {
  buildShopifyOAuthLoginUrl,
  exchangeShopifyCodeForToken,
  isShopifyOAuthConfigured,
  sanitizeShopDomain,
  syncShopifyConnector,
} from "@openai-harness/connector-shopify";
import {
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
  createAuthSession,
  ensureUserSessions,
} from "../auth";
import {
  getOrCreateAnonymousUser,
  rebindUserWithGoogle,
} from "@openai-harness/google-account";
import {
  getRequestUser,
  headerValue,
  requestIdentityUserId,
} from "../request-user";

const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
const META_CALLBACK_PATH = "/api/auth/meta/callback";
const SHOPIFY_CALLBACK_PATH = "/api/auth/shopify/callback";

/**
 * The external origin of the request, matching how Next derived
 * `nextUrl.origin`: forwarded host/proto first, then the Host header.
 */
function requestOrigin(req: IncomingMessage): string {
  const forwardedProto = headerValue(req.headers, "x-forwarded-proto");
  const protocol = forwardedProto === "https" ? "https" : "http";
  const host =
    headerValue(req.headers, "x-forwarded-host") ??
    headerValue(req.headers, "host") ??
    "localhost";
  return `${protocol}://${host}`;
}

/** The request URL, resolved against the external origin. */
function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", requestOrigin(req));
}

/** UI origins served beside the Gateway (the Vite dev host by default). */
const DEFAULT_APP_ORIGINS = "http://localhost:5173";

/**
 * True when `value` is a bare origin the browser may be sent back to.
 *
 * The OAuth hop itself always runs on the Gateway origin — that is the
 * registered `redirect_uri` — but in development the UI is served from another
 * origin (Vite, proxying `/api` here). Carrying that origin through `state`
 * makes the callback land on the page the user actually opened. Only an
 * allowlisted bare origin qualifies, so the parameter can never turn the
 * callback into an open redirect.
 */
function isAllowedAppOrigin(value: string | null | undefined): value is string {
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.origin !== value.replace(/\/$/, "")) return false;
  return (process.env.GATEWAY_ALLOWED_ORIGINS ?? DEFAULT_APP_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .includes(parsed.origin);
}

/** Where the browser lands after an OAuth round-trip. */
interface OAuthReturn {
  /** Application path to reopen. */
  returnTo: string;
  /** UI origin when it differs from the Gateway origin. */
  origin?: string;
}

/** Encode {@link OAuthReturn} as an opaque `state` value. */
function encodeOAuthState(value: OAuthReturn): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** Decode an `state` value; anything unexpected falls back to `/c`. */
function decodeOAuthState(state: string | null): OAuthReturn {
  if (!state) return { returnTo: "/c" };
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { returnTo?: unknown; origin?: unknown };
    return {
      returnTo: safeReturnTo(
        typeof parsed.returnTo === "string" ? parsed.returnTo : null,
      ),
      ...(isAllowedAppOrigin(
        typeof parsed.origin === "string" ? parsed.origin : null,
      )
        ? { origin: parsed.origin as string }
        : {}),
    };
  } catch {
    // Legacy plain-path state (`/c/<threadId>`).
    return { returnTo: safeReturnTo(state) };
  }
}

/** The UI origin for a post-callback redirect: the carried one, else here. */
function appOrigin(req: IncomingMessage, carried?: string): string {
  return carried ?? requestOrigin(req);
}

/** Only accept `returnTo` values that stay on this application. */
function safeReturnTo(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") ? raw : "/c";
}

/** `Set-Cookie` value for a completed sign-in. */
function sessionCookie(token: string): string {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${AUTH_SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    "SameSite=Lax",
  ].join("; ");
}

/** `Set-Cookie` value for sign-out; the name matches the session cookie. */
function clearSessionCookie(): string {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    "SameSite=Lax",
  ].join("; ");
}

/** Answer a method the former Next route did not export. */
function allowMethod(
  req: IncomingMessage,
  res: ServerResponse,
  method: "GET" | "POST",
): boolean {
  if (req.method === method) return true;
  res.writeHead(405, { Allow: method });
  res.end();
  return false;
}

/** 307, matching `NextResponse.redirect`'s default. */
function redirect(
  res: ServerResponse,
  location: string,
  setCookie?: string,
): void {
  const headers: Record<string, string> = { Location: location };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  res.writeHead(307, headers);
  res.end();
}

/**
 * Merge `params` into `returnTo`'s query, replacing keys that are already
 * present.
 *
 * A connector login can start from a page whose URL still carries the previous
 * callback's parameters. Appending would stack a second pair every round-trip,
 * so `set` keeps each key single-valued; unrelated parameters stay untouched.
 */
export function mergeRedirectQuery(
  origin: string,
  returnTo: string,
  params: Record<string, string> | URLSearchParams,
): string {
  const target = new URL(returnTo, origin);
  const search = new URLSearchParams(target.search);
  const entries: Iterable<[string, string]> =
    params instanceof URLSearchParams
      ? params.entries()
      : Object.entries(params);
  for (const [key, value] of entries) search.set(key, value);
  target.search = search.toString();
  return target.toString();
}

/** Redirect back to `returnTo` with an `error` query parameter set. */
function redirectWithError(
  res: ServerResponse,
  origin: string,
  returnTo: string,
  message: string,
): void {
  redirect(res, mergeRedirectQuery(origin, returnTo, { error: message }));
}

/** Redirect back to `returnTo` with a caller-supplied query fragment. */
function redirectWithQuery(
  res: ServerResponse,
  origin: string,
  returnTo: string,
  query: string,
): void {
  redirect(
    res,
    mergeRedirectQuery(origin, returnTo, new URLSearchParams(query)),
  );
}

/** Small JSON responder used by `/api/auth/logout`. */
function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  setCookie?: string,
): void {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

/** GET `/api/auth/google/login`. */
async function handleGoogleLogin(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!allowMethod(req, res, "GET")) return;

  const origin = requestOrigin(req);
  const url = requestUrl(req);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const requestedOrigin = url.searchParams.get("returnOrigin");
  const returnOrigin = isAllowedAppOrigin(requestedOrigin)
    ? requestedOrigin
    : undefined;

  try {
    const user = await getRequestUser(req);
    // A signed-in anonymous user wins; otherwise carry the client's stable
    // identity from the cookie/header/query so the callback rebinds it.
    const anonymousUserId =
      user && !user.googleId ? user.id : requestIdentityUserId(req);
    const statePayload = {
      returnTo,
      anonymousUserId,
      ...(returnOrigin ? { origin: returnOrigin } : {}),
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString(
      "base64url",
    );
    redirect(res, getGoogleOAuthLoginUrl(origin, state));
  } catch (err: unknown) {
    console.error("[Google OAuth Login Error]", err);
    redirectWithError(
      res,
      appOrigin(req, returnOrigin),
      returnTo,
      "Unable to start Google sign-in. Please try again or contact support.",
    );
  }
}

/** GET `/api/auth/google/callback`. */
async function handleGoogleCallback(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!allowMethod(req, res, "GET")) return;

  const origin = requestOrigin(req);
  const url = requestUrl(req);
  let redirectUrl = "/c";
  // Where the browser is sent: the UI origin carried through `state` (the Vite
  // host in development), else the Gateway origin serving this callback.
  let browserOrigin = origin;

  try {
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const stateParam = url.searchParams.get("state") ?? "/c";

    let anonymousUserId: string | undefined;
    let returnOrigin: string | undefined;

    try {
      if (stateParam.startsWith("{") || stateParam.includes("%7B")) {
        const parsed = JSON.parse(decodeURIComponent(stateParam)) as {
          returnTo?: string;
          anonymousUserId?: string;
          origin?: string;
        };
        redirectUrl = parsed.returnTo ?? "/c";
        anonymousUserId = parsed.anonymousUserId;
        returnOrigin = parsed.origin;
      } else {
        const decoded = Buffer.from(stateParam, "base64url").toString("utf-8");
        const parsed = JSON.parse(decoded) as {
          returnTo?: string;
          anonymousUserId?: string;
          origin?: string;
        };
        redirectUrl = parsed.returnTo ?? "/c";
        anonymousUserId = parsed.anonymousUserId;
        returnOrigin = parsed.origin;
      }
    } catch {
      redirectUrl = stateParam.startsWith("/") ? stateParam : "/c";
    }

    if (!redirectUrl.startsWith("/")) redirectUrl = "/c";

    browserOrigin = appOrigin(
      req,
      isAllowedAppOrigin(returnOrigin) ? returnOrigin : undefined,
    );

    if (error) {
      const message =
        error === "access_denied"
          ? "Google sign-in was cancelled."
          : "Google sign-in failed. Please try again.";
      redirectWithError(res, browserOrigin, redirectUrl, message);
      return;
    }

    if (!code) {
      redirectWithError(
        res,
        browserOrigin,
        redirectUrl,
        "Authorization code was not received from Google. Please try again.",
      );
      return;
    }

    if (!anonymousUserId) {
      const currentUser = await getRequestUser(req);
      anonymousUserId =
        currentUser && !currentUser.googleId
          ? currentUser.id
          : requestIdentityUserId(req);
    }

    const identity = await exchangeGoogleCodeForUser(code, origin);

    if (anonymousUserId) {
      // The client mints its id before its first request; create the record if
      // this callback arrives before any API call so the rebind has a tenant.
      const ensured = await getOrCreateAnonymousUser(anonymousUserId);
      if (!ensured.success || !ensured.data) {
        throw new Error(
          ensured.error ?? "Failed to create the anonymous user record.",
        );
      }
      anonymousUserId = ensured.data.id;
    }

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
    // A first-time Google account owns the same default agent sessions an
    // anonymous one does.
    await ensureUserSessions(user.id);
    const token = await createAuthSession(user);
    redirect(
      res,
      new URL(redirectUrl, browserOrigin).toString(),
      sessionCookie(token),
    );
  } catch (err: unknown) {
    console.error("[Google OAuth Callback Error]", err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to complete Google sign-in. Please try again or contact support.";
    const targetUrl = new URL(redirectUrl, browserOrigin);
    targetUrl.searchParams.set("error", message);
    redirect(res, targetUrl.toString());
  }
}

/** GET `/api/auth/meta/login`. */
async function handleMetaLogin(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!allowMethod(req, res, "GET")) return;

  const origin = requestOrigin(req);
  const url = requestUrl(req);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const requestedOrigin = url.searchParams.get("returnOrigin");
  const returnOrigin = isAllowedAppOrigin(requestedOrigin)
    ? requestedOrigin
    : undefined;
  const browserOrigin = appOrigin(req, returnOrigin);

  const user = await getRequestUser(req);
  if (!user?.id) {
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Please sign in before connecting your Meta Ads account.",
    );
    return;
  }

  if (!isMetaOAuthConfigured()) {
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Meta Ads integration is currently unavailable. Please verify META_APP_ID and META_APP_SECRET in .env.",
    );
    return;
  }

  try {
    // `redirect_uri` stays on this Gateway origin; the UI origin travels in
    // `state` so the callback lands on the page the user opened.
    redirect(
      res,
      getMetaOAuthLoginUrl(
        origin,
        encodeOAuthState({
          returnTo,
          ...(returnOrigin ? { origin: returnOrigin } : {}),
        }),
      ),
    );
  } catch (err: unknown) {
    console.error("[Meta OAuth Login Error]", err);
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Unable to start Meta Ads authentication. Please try again or contact support.",
    );
  }
}

/** GET `/api/auth/meta/callback`. */
async function handleMetaCallback(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!allowMethod(req, res, "GET")) return;

  const url = requestUrl(req);
  const origin = requestOrigin(req);

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  const { returnTo, origin: returnOrigin } = decodeOAuthState(
    url.searchParams.get("state"),
  );
  // Meta returns to the Gateway origin (the registered `redirect_uri`); the
  // browser must not be left there, because only the UI origin serves `/c`.
  const browserOrigin = appOrigin(req, returnOrigin);

  if (error || errorDesc) {
    const message =
      error === "access_denied"
        ? "Meta Ads connection was cancelled."
        : "Meta Ads connection failed. Please try again.";
    redirectWithError(res, browserOrigin, returnTo, message);
    return;
  }

  if (!code) {
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Authorization code was not received from Meta. Please try again.",
    );
    return;
  }

  const user = await getRequestUser(req);
  if (!user?.id) {
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Your session expired while connecting Meta Ads. Please sign in and try again.",
    );
    return;
  }

  try {
    const { accessToken } = await exchangeMetaCodeForToken(code, origin);
    const synced = await syncMetaConnector({
      context: { userId: user.id, providerSlug: "meta", accessToken },
    });
    // `syncMetaConnector` reports token/verification failures in its envelope
    // instead of throwing; silence here would claim a connection that never
    // happened.
    if (!synced.success) {
      throw new Error(synced.error?.message ?? "Meta token verification failed.");
    }

    redirectWithQuery(
      res,
      browserOrigin,
      returnTo,
      "open_connector=metaAds&meta_connected=true",
    );
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    // One line: the reason is short and carries no token material.
    console.error(`[Meta OAuth Callback Error] ${reason}`);
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      `Failed to complete Meta Ads connection: ${reason}`,
    );
  }
}

/** GET `/api/auth/shopify/login`. */
async function handleShopifyLogin(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!allowMethod(req, res, "GET")) return;

  const origin = requestOrigin(req);
  const url = requestUrl(req);
  const rawShop = url.searchParams.get("shop");
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const requestedOrigin = url.searchParams.get("returnOrigin");
  const returnOrigin = isAllowedAppOrigin(requestedOrigin)
    ? requestedOrigin
    : undefined;
  const browserOrigin = appOrigin(req, returnOrigin);

  const user = await getRequestUser(req);
  if (!user?.id) {
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Please sign in before connecting your Shopify store.",
    );
    return;
  }

  if (!rawShop || !rawShop.trim()) {
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Please enter a valid Shopify store domain (e.g., mystore.myshopify.com).",
    );
    return;
  }

  if (!isShopifyOAuthConfigured()) {
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Shopify integration is currently unconfigured. Please set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env.",
    );
    return;
  }

  try {
    const shopDomain = sanitizeShopDomain(rawShop);
    const statePayload = JSON.stringify({
      userId: user.id,
      shop: shopDomain,
      returnTo,
      ...(returnOrigin ? { origin: returnOrigin } : {}),
      nonce: Math.random().toString(36).substring(2),
    });
    const state = Buffer.from(statePayload, "utf8").toString("base64url");

    redirect(
      res,
      buildShopifyOAuthLoginUrl({
        shop: shopDomain,
        origin,
        state,
      }),
    );
  } catch (err: unknown) {
    console.error("[Shopify OAuth Login Error]", err);
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Unable to start Shopify authorization. Please check the store name and try again.",
    );
  }
}

/**
 * GET `/api/auth/shopify/callback`.
 *
 * The `/api/v1/integrations/shopify/callback` alias that the deleted Next
 * re-export served is registered by the connectors plugin, which owns the
 * client-side Shopify endpoints; the handler body is intentionally the same.
 */
async function handleShopifyCallback(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!allowMethod(req, res, "GET")) return;

  const url = requestUrl(req);

  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state") ?? "/c";

  const { returnTo, origin: returnOrigin } = decodeOAuthState(state);
  const browserOrigin = appOrigin(req, returnOrigin);

  if (error || !code || !shop) {
    const message = error
      ? "Shopify connection cancelled."
      : "Missing Shopify authorization code.";
    redirectWithError(res, browserOrigin, returnTo, message);
    return;
  }

  const user = await getRequestUser(req);
  if (!user?.id) {
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Please sign in before connecting Shopify.",
    );
    return;
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

    redirectWithQuery(
      res,
      browserOrigin,
      returnTo,
      "open_connector=shopify&shopify_connected=true",
    );
  } catch (err: unknown) {
    console.error("[Shopify OAuth Callback Error]", err);
    redirectWithError(
      res,
      browserOrigin,
      returnTo,
      "Failed to complete Shopify connection.",
    );
  }
}

/**
 * GET `/api/auth/session`.
 *
 * Bootstrap read for the static Vite shell: returns the signed-in user (the
 * same resolution the former Next session adapter used) or `null` when no
 * cookie/anonymous identity resolves. Kept out of shared caches.
 */
async function handleAuthSession(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!allowMethod(req, res, "GET")) return;

  try {
    const user = await getRequestUser(req);
    // The shell reads this before it resolves `/c`, so the caller's default
    // sessions must exist by the time the response is written.
    if (user !== null) await ensureUserSessions(user.id);
    res.setHeader("Cache-Control", "no-store");
    writeJson(res, 200, { user });
  } catch (err: unknown) {
    console.error("[Auth Session Error]", err);
    writeJson(res, 500, { user: null });
  }
}

/** POST `/api/auth/logout`. */
async function handleLogout(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!allowMethod(req, res, "POST")) return;

  try {
    writeJson(
      res,
      200,
      { success: true, message: "Logged out successfully" },
      clearSessionCookie(),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to logout";
    writeJson(res, 500, { success: false, error: message });
  }
}

/** The exact paths served by the former Next `src/app/api/auth/**` handlers. */
function buildRoutes(): WebRoute[] {
  return [
    { kind: "exact", path: "/api/auth/google/login", handler: handleGoogleLogin },
    {
      kind: "exact",
      path: GOOGLE_CALLBACK_PATH,
      handler: handleGoogleCallback,
    },
    { kind: "exact", path: "/api/auth/meta/login", handler: handleMetaLogin },
    { kind: "exact", path: META_CALLBACK_PATH, handler: handleMetaCallback },
    {
      kind: "exact",
      path: "/api/auth/shopify/login",
      handler: handleShopifyLogin,
    },
    {
      kind: "exact",
      path: SHOPIFY_CALLBACK_PATH,
      handler: handleShopifyCallback,
    },
    {
      kind: "exact",
      path: "/api/auth/session",
      handler: handleAuthSession,
    },
    { kind: "exact", path: "/api/auth/logout", handler: handleLogout },
  ];
}

/**
 * Gateway plugin registering the authentication HTTP routes.
 *
 * `static inject` keeps the plugin unloaded until `webServer` is available, so
 * the constructor can register every route synchronously.
 */
export class AuthRoutes {
  static inject = ["webServer"];

  constructor(ctx: Context) {
    ctx.effect(() => {
      const releases = buildRoutes().map((route) =>
        ctx.webServer.register(route),
      );
      return () => {
        for (const release of releases) release();
      };
    }, "gateway: auth routes");
  }
}

export default AuthRoutes;
