/**
 * Google OAuth route registration plugin.
 *
 * Follows the reference's `GoogleAccount` service: a Cordis service that owns
 * the filesystem user store and mounts its HTTP routes through
 * `ctx.inject(['webServer'], ...)` once the host webserver is available. It
 * registers the reference's initiate paths (`/auth/google`, `/api/auth/google`)
 * and callback paths (`/auth/google/callback`, `/api/auth/callback/google`),
 * plus the application's `/api/auth/google/callback` path and any configured
 * callback pathname.
 *
 * Adaptation: the reference stores a raw `dsh-user-id` pointer cookie. This
 * deployment's connection carrier verifies the application's signed
 * `ads-easy-session` JWT, so the callback signs the same token through
 * `@openai-harness/credentials` and sets that cookie. Cookie name, lifetime,
 * and `HttpOnly; SameSite=Lax` attributes therefore stay unchanged for the
 * gateway.
 *
 * @module @openai-harness/google-account/plugin
 */

import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { Context, Service } from "@deepseek-ai/cordis";
// Activates the webServer Context merge used below.
import type {} from "@openai-harness/host-webserver";
import { SessionTokens } from "@openai-harness/credentials";
import { isValidUuidV7 } from "@openai-harness/uuid";
import {
  exchangeGoogleCodeForUser,
  getGoogleOAuthLoginUrl,
  type GoogleIdentity,
} from "./google";
import {
  getDefaultUserStore,
  getOrCreateAnonymousUser,
  rebindUserWithGoogle,
} from "./users";
import { UserStore, type StoredUser } from "./user-store";

/** Configuration for {@link GoogleAccount}. */
export interface GoogleAccountConfig {
  /** Root holding `<uuid>/user.json` records; defaults to `data/users`. */
  readonly usersRoot?: string;
  /** Session cookie name; defaults to the gateway's `ads-easy-session`. */
  readonly sessionCookieName?: string;
  /** Session JWT lifetime; defaults to `7d`. */
  readonly sessionExpiry?: string;
  /** Signing secret; defaults to `process.env.AUTH_SECRET`. */
  readonly authSecret?: string | Uint8Array;
  /** Additional callback URL whose pathname should be registered. */
  readonly callbackUrl?: string;
}

/** Gateway session cookie name, matching `apps/gateway/src/lib/auth/token.ts`. */
const DEFAULT_SESSION_COOKIE_NAME = "ads-easy-session";
/**
 * Cookie the browser identity helper persists the anonymous UUIDv7 in
 * (`@openai-harness/client-connection`'s `USER_ID_COOKIE_NAME`). The value is
 * duplicated here rather than imported so the server credential package does
 * not depend on the browser transport package.
 */
const IDENTITY_COOKIE_NAME = "oh-user-id";
/** Gateway session lifetime, matching `apps/gateway/src/lib/auth/token.ts`. */
const DEFAULT_SESSION_EXPIRY = "7d";
/** Gateway session cookie `Max-Age`, matching the application's seven days. */
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Reference initiate paths. */
const INITIATE_PATHS = ["/auth/google", "/api/auth/google"] as const;

/** Reference callback paths plus the application's origin-derived path. */
const REFERENCE_CALLBACK_PATHS = [
  "/auth/google/callback",
  "/api/auth/callback/google",
  "/api/auth/google/callback",
] as const;

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Google account user store and OAuth routes. */
    googleAccount: GoogleAccount;
  }
}

/** One request header, collapsing Node's repeated-header array form. */
function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The external origin of the request: forwarded host/proto first, then the
 * Host header, matching how the application derived request origins.
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

/** Resolve the request URL against the external origin. */
function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", requestOrigin(req));
}

/** Only accept `returnTo` values that stay on this application. */
function safeReturnTo(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") ? raw : "/c";
}

/** One cookie value from a raw `Cookie` header, URI-decoded. */
function cookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const entry = part.trim();
    if (!entry.startsWith(`${name}=`)) continue;
    const raw = entry.slice(name.length + 1);
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/**
 * Resolve the anonymous identity a request carries outside its session
 * cookie: the browser's identity cookie first, then the `x-user-id` (or legacy
 * `x-anonymous-user-id`) header, then the `userId`/`anonymousUserId` query.
 * Only a canonical UUIDv7 is accepted.
 */
function requestIdentityUserId(req: IncomingMessage): string | undefined {
  const cookie = cookieValue(
    headerValue(req.headers, "cookie"),
    IDENTITY_COOKIE_NAME,
  );
  if (cookie !== undefined && isValidUuidV7(cookie)) return cookie;

  const header = (
    headerValue(req.headers, "x-user-id") ??
    headerValue(req.headers, "x-anonymous-user-id")
  )?.trim();
  if (header !== undefined && isValidUuidV7(header)) return header;

  const url = requestUrl(req);
  const query = (
    url.searchParams.get("userId") ??
    url.searchParams.get("anonymousUserId")
  )?.trim();
  return query !== undefined && isValidUuidV7(query) ? query : undefined;
}

interface OAuthState {
  readonly returnTo: string;
  readonly anonymousUserId?: string | undefined;
}

/** Encode the return destination and optional anonymous identity in `state`. */
function encodeState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

/** Decode `state`, falling back to the default destination. */
function decodeState(raw: string | null): OAuthState {
  if (!raw) return { returnTo: "/c" };
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as { returnTo?: unknown; anonymousUserId?: unknown };
    return {
      returnTo:
        typeof parsed.returnTo === "string" && parsed.returnTo.startsWith("/")
          ? parsed.returnTo
          : "/c",
      anonymousUserId:
        typeof parsed.anonymousUserId === "string"
          ? parsed.anonymousUserId
          : undefined,
    };
  } catch {
    return { returnTo: raw.startsWith("/") ? raw : "/c" };
  }
}

/** 307, matching the gateway's other auth redirects. */
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

/** Redirect back to `returnTo` with an `error` query parameter appended. */
function redirectWithError(
  res: ServerResponse,
  origin: string,
  returnTo: string,
  message: string,
): void {
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(
    res,
    new URL(
      `${returnTo}${separator}error=${encodeURIComponent(message)}`,
      origin,
    ).toString(),
  );
}

/** `Set-Cookie` value for a completed sign-in. */
function sessionCookie(
  name: string,
  token: string,
): string {
  return [
    `${name}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    "SameSite=Lax",
  ].join("; ");
}

/**
 * Google account service: filesystem user storage plus the reference's
 * initiate/callback route registration.
 */
export class GoogleAccount extends Service {
  private readonly config: GoogleAccountConfig;

  /**
   * @param ctx - owning Context; routes mount when `webServer` appears.
   * @param config - optional store/session overrides.
   */
  constructor(ctx: Context, config: GoogleAccountConfig = {}) {
    super(ctx, "googleAccount");
    this.config = config;

    ctx.inject(["webServer"], (webCtx) => {
      this.registerWebRoutes(webCtx);
    });
  }

  private registerWebRoutes(webCtx: Context): void {
    const callbackPaths = new Set<string>(REFERENCE_CALLBACK_PATHS);
    if (this.config.callbackUrl) {
      try {
        const parsedPath = new URL(this.config.callbackUrl).pathname;
        if (parsedPath) callbackPaths.add(parsedPath);
      } catch {
        // A malformed configured callback URL contributes no extra path.
      }
    }

    for (const path of INITIATE_PATHS) {
      webCtx.webServer.register({
        kind: "exact",
        path,
        handler: (req, res) => this.handleInitiate(req, res),
      });
    }

    for (const path of callbackPaths) {
      webCtx.webServer.register({
        kind: "exact",
        path,
        handler: (req, res) => this.handleCallback(req, res),
      });
    }
  }

  /** Redirect the browser to Google, carrying return/anonymous state. */
  private handleInitiate(
    req: IncomingMessage,
    res: ServerResponse,
  ): void {
    const origin = requestOrigin(req);
    const url = requestUrl(req);
    const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
    // Carry the client's stable anonymous id through the Google round trip so
    // the callback rebinds that exact record.
    const anonymousUserId = requestIdentityUserId(req);

    try {
      redirect(
        res,
        getGoogleOAuthLoginUrl(
          origin,
          encodeState({ returnTo, anonymousUserId }),
        ),
      );
    } catch (error) {
      console.error("[Google OAuth Login Error]", error);
      redirectWithError(
        res,
        origin,
        returnTo,
        "Unable to start Google sign-in. Please try again or contact support.",
      );
    }
  }

  /** Exchange the code, bind the user record, and issue the session cookie. */
  private async handleCallback(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const origin = requestOrigin(req);
    const url = requestUrl(req);
    const state = decodeState(url.searchParams.get("state"));

    try {
      const error = url.searchParams.get("error");
      if (error) {
        redirectWithError(
          res,
          origin,
          state.returnTo,
          error === "access_denied"
            ? "Google sign-in was cancelled."
            : "Google sign-in failed. Please try again.",
        );
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        redirectWithError(
          res,
          origin,
          state.returnTo,
          "Authorization code was not received from Google. Please try again.",
        );
        return;
      }

      const identity = await exchangeGoogleCodeForUser(code, origin);
      // The state carries the id captured at initiate; a callback reached
      // directly (or after state loss) still sees the identity cookie/header/
      // query, so the same user record is upgraded instead of duplicated.
      const anonymousUserId =
        state.anonymousUserId ?? requestIdentityUserId(req);
      const user = this.linkGoogleUser(identity, anonymousUserId);
      const token = await this.signSession(user);

      redirect(
        res,
        new URL(state.returnTo, origin).toString(),
        sessionCookie(
          this.config.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME,
          token,
        ),
      );
    } catch (error) {
      console.error("[Google OAuth Callback Error]", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to complete Google sign-in. Please try again or contact support.";
      redirectWithError(res, origin, state.returnTo, message);
    }
  }

  /**
   * Bind a verified Google identity onto the caller's anonymous record.
   *
   * An existing Google (or email) match wins and is returned unchanged, which
   * preserves "signing in with a Google sub that already has a different user
   * returns that existing user". Otherwise the anonymous record named by the
   * request is updated in place, so its sessions and connector rows stay
   * attached.
   */
  private linkGoogleUser(
    identity: GoogleIdentity,
    anonymousUserId: string | undefined,
  ): StoredUser {
    const store = this.userStore();
    let targetId = anonymousUserId;

    if (targetId !== undefined) {
      // The carrier normally created this record already; ensure it here so a
      // callback that reaches the gateway directly still rebinds in place.
      const ensured = getOrCreateAnonymousUser(targetId, store);
      if (!ensured.success || !ensured.data) {
        throw new Error(
          ensured.error ?? "Failed to create the anonymous user record.",
        );
      }
      targetId = ensured.data.id;
    } else if (store.getUserByGoogleSub(identity.googleId) === undefined) {
      const ensured = getOrCreateAnonymousUser(undefined, store);
      if (!ensured.success || !ensured.data) {
        throw new Error(
          ensured.error ?? "Failed to create the anonymous user record.",
        );
      }
      targetId = ensured.data.id;
    }

    const result = rebindUserWithGoogle(
      {
        id: targetId,
        googleId: identity.googleId,
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
        emailVerified: identity.emailVerified,
      },
      store,
    );
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Failed to authenticate with Google");
    }
    return result.data;
  }

  /** The store for the configured root, or the project-local default. */
  private userStore(): UserStore {
    return this.config.usersRoot === undefined
      ? getDefaultUserStore()
      : getStoreForRoot(this.config.usersRoot);
  }

  /** Sign the gateway's session JWT with the configured secret. */
  private async signSession(user: StoredUser): Promise<string> {
    const secret = this.config.authSecret ?? process.env.AUTH_SECRET;
    if (
      secret === undefined ||
      (typeof secret === "string" && secret.length === 0)
    ) {
      throw new Error("AUTH_SECRET environment variable is not set");
    }
    return new SessionTokens({
      secret,
      expiresIn: this.config.sessionExpiry ?? DEFAULT_SESSION_EXPIRY,
    }).sign(user);
  }
}

/** Per-root store cache for explicitly configured roots. */
const storesByRoot = new Map<string, UserStore>();

/** Resolve one store per configured root, reusing the instance. */
function getStoreForRoot(root: string): UserStore {
  let store = storesByRoot.get(root);
  if (store === undefined) {
    store = new UserStore(root);
    storesByRoot.set(root, store);
  }
  return store;
}

export default GoogleAccount;
