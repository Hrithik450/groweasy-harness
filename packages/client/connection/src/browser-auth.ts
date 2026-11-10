/**
 * Browser-session authentication for the Host Connection carrier.
 *
 * The transport decides only whether a request is authenticated and which
 * user it belongs to. Cookie verification and user loading are deployment
 * concerns, so they arrive as injected seams: the service takes a
 * `lookupUser` function (or a `users` service adapter) rather than importing
 * the application or `@openai-harness/google-account`. That is the same shape
 * as the reference's `BrowserAuth`, which depends on `credentials` instead of
 * a concrete store.
 *
 * Cookie semantics are the application's existing ones, not the reference's
 * HMAC scheme: the service reads `ads-easy-session` (override via
 * `cookieName`), verifies the HS256 session JWT through
 * `@openai-harness/credentials` with `AUTH_SECRET`, then asks the seam to load
 * the user. A host may inject its own `verifySession` to keep an existing
 * verifier authoritative.
 *
 * @module @openai-harness/client-connection/browser-auth
 */

import { Context, Service } from "@deepseek-ai/cordis";
import { SessionTokens } from "@openai-harness/credentials";
import { firstHeaderValue, isUuidV7, mintUuidv7 } from "./user-id";

/** Default cookie name, matching the gateway's session cookie. */
export const BROWSER_AUTH_COOKIE_NAME = "ads-easy-session";

/** Default session lifetime, matching the gateway's session token. */
export const BROWSER_AUTH_SESSION_EXPIRY = "7d";

/** The minimum user fact the carrier needs. */
export interface BrowserAuthUser {
  /** Stable user id the request belongs to. */
  readonly id: string;
}

/** What an injected user lookup may return. */
export type BrowserAuthUserLookupResult =
  | BrowserAuthUser
  | string
  | null
  | undefined;

/**
 * Injected user lookup. Returning a string is shorthand for `{ id }`; null or
 * undefined means the verified id names no stored user.
 */
export type BrowserAuthUserLookup = (
  userId: string,
) => Promise<BrowserAuthUserLookupResult> | BrowserAuthUserLookupResult;

/** Injected session-token verifier; returns the certified user id or null. */
export type BrowserAuthSessionVerifier = (
  token: string,
) => Promise<string | null> | string | null;

/**
 * Injected creator/loader for the anonymous id the carrier resolved. A host
 * that owns a user store ensures the record exists so sessions can attach to
 * it; returning a string is shorthand for `{ id }`.
 */
export type BrowserAuthUserEnsurer = (
  userId: string,
) => Promise<BrowserAuthUserLookupResult> | BrowserAuthUserLookupResult;

/** The identity facts one carrier request carries outside its session cookie. */
export interface BrowserIdentityRequest {
  /** Raw `Cookie` header, or undefined. */
  readonly cookie?: string | undefined;
  /** `x-user-id` header, or undefined. */
  readonly headerUserId?: string | readonly string[] | undefined;
  /** `userId` query parameter, or undefined. */
  readonly queryUserId?: string | readonly string[] | undefined;
}

/** Who one request belongs to, and how that identity was established. */
export interface BrowserIdentity {
  /** Stable user id the request belongs to. */
  readonly userId: string;
  /** True when the signed session cookie certified the id. */
  readonly authenticated: boolean;
  /** True when the id came from the anonymous header/query/mint path. */
  readonly anonymous: boolean;
  /** True when no caller-supplied id was usable and one was minted. */
  readonly minted: boolean;
}

/** Host-supplied dependencies for {@link BrowserAuthService}. */
export interface BrowserAuthOptions {
  /** Load a user by the id the session token certified. */
  readonly lookupUser: BrowserAuthUserLookup;
  /** Ensure the anonymous user exists before sessions attach to it. */
  readonly ensureUser?: BrowserAuthUserEnsurer;
  /** Override the built-in JWT verifier; the host's verifier stays authoritative. */
  readonly verifySession?: BrowserAuthSessionVerifier;
  /** Session cookie name; defaults to {@link BROWSER_AUTH_COOKIE_NAME}. */
  readonly cookieName?: string;
  /** JWT lifetime used by the built-in verifier; defaults to `7d`. */
  readonly sessionExpiry?: string;
  /** Signing secret used by the built-in verifier; defaults to `AUTH_SECRET`. */
  readonly authSecret?: string | Uint8Array;
}

/** Resolves the user behind one carrier request. */
export interface BrowserAuth {
  /**
   * Resolve the authenticated user owning the raw `Cookie` header.
   * @param cookieHeader - the request's `Cookie` header, or undefined.
   * @returns the owning user id, or null when the request is unauthenticated.
   */
  authenticate(cookieHeader: string | undefined): Promise<string | null>;
  /**
   * Resolve the request's stable identity: the signed session cookie first,
   * then a caller-supplied UUIDv7 header/query value, then a fresh UUIDv7.
   * @param request - cookie/header/query identity facts.
   * @returns the resolved identity (never null).
   */
  resolve(request: BrowserIdentityRequest): Promise<BrowserIdentity>;
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Browser-session authentication provided by the host application. */
    browserAuth: BrowserAuth;
  }
}

/** One cookie value from a raw `Cookie` header, URI-decoded. */
function parseCookie(
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
 * Application-agnostic `browserAuth` service.
 *
 * The transport owns whether a request may proceed; this service answers who
 * it belongs to using the host's cookie verifier and user lookup.
 */
export class BrowserAuthService extends Service implements BrowserAuth {
  private readonly lookupUser: BrowserAuthUserLookup;
  private readonly ensureUser: BrowserAuthUserEnsurer | undefined;
  private readonly verifySessionOverride:
    | BrowserAuthSessionVerifier
    | undefined;
  private readonly cookieName: string;
  private readonly sessionExpiry: string;
  private readonly authSecret: string | Uint8Array | undefined;

  /**
   * @param ctx - owning Context.
   * @param options - user lookup plus optional verifier/cookie overrides.
   */
  constructor(ctx: Context, options: BrowserAuthOptions) {
    super(ctx, "browserAuth");
    if (typeof options?.lookupUser !== "function") {
      throw new TypeError(
        "client-connection: BrowserAuthService requires a lookupUser function",
      );
    }
    this.lookupUser = options.lookupUser;
    this.ensureUser = options.ensureUser;
    this.verifySessionOverride = options.verifySession;
    this.cookieName = options.cookieName ?? BROWSER_AUTH_COOKIE_NAME;
    this.sessionExpiry = options.sessionExpiry ?? BROWSER_AUTH_SESSION_EXPIRY;
    this.authSecret = options.authSecret;
  }

  /** Resolve the authenticated user from the request's session cookie. */
  async authenticate(cookieHeader: string | undefined): Promise<string | null> {
    return this.sessionUserId(cookieHeader);
  }

  /**
   * Resolve the stable identity behind one request.
   *
   * Order: signed session cookie, then a valid UUIDv7 in the `x-user-id`
   * header, then a valid UUIDv7 in the `userId` query parameter, then a fresh
   * UUIDv7. The anonymous paths ensure the user record exists so the caller's
   * sessions and connectors attach to the same tenant from the first request.
   */
  async resolve(request: BrowserIdentityRequest): Promise<BrowserIdentity> {
    let sessionUserId: string | null = null;
    try {
      sessionUserId = await this.sessionUserId(request.cookie);
    } catch (error) {
      // An invalid or expired token falls through to the anonymous identity
      // path instead of rejecting the request outright.
      this.ctx.logger.warn(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    if (sessionUserId !== null) {
      return {
        userId: sessionUserId,
        authenticated: true,
        anonymous: false,
        minted: false,
      };
    }

    const headerUserId = firstHeaderValue(request.headerUserId);
    const queryUserId = firstHeaderValue(request.queryUserId);
    const supplied = isUuidV7(headerUserId)
      ? headerUserId
      : isUuidV7(queryUserId)
        ? queryUserId
        : undefined;
    const userId = supplied ?? mintUuidv7();

    if (this.ensureUser !== undefined) {
      await this.ensureUser(userId);
    }

    return {
      userId,
      authenticated: false,
      anonymous: true,
      minted: supplied === undefined,
    };
  }

  /**
   * Verify one session cookie and load its user.
   *
   * @param cookieHeader - raw `Cookie` header, or undefined.
   * @returns the certified user id, or null when it is absent or unknown.
   */
  private async sessionUserId(
    cookieHeader: string | undefined,
  ): Promise<string | null> {
    const token = parseCookie(cookieHeader, this.cookieName);
    if (token === undefined) return null;

    const userId = await this.verify(token);
    if (userId === null || userId.length === 0) return null;

    const user = await this.lookupUser(userId);
    if (user === null || user === undefined) return null;
    return typeof user === "string" ? user : user.id;
  }

  /**
   * Verify one session cookie value.
   *
   * With no injected verifier this reproduces the application's
   * `verifyAuthSession`: an HS256 JWT signed with `AUTH_SECRET` and a seven-day
   * lifetime, whose certified user id is the session owner.
   */
  private async verify(token: string): Promise<string | null> {
    if (this.verifySessionOverride !== undefined) {
      return await this.verifySessionOverride(token);
    }

    const secret = this.authSecret ?? process.env.AUTH_SECRET;
    if (
      secret === undefined ||
      (typeof secret === "string" && secret.length === 0)
    ) {
      throw new Error("AUTH_SECRET environment variable is not set");
    }

    const tokens = new SessionTokens({
      secret,
      expiresIn: this.sessionExpiry,
    });
    return (await tokens.verify(token))?.id ?? null;
  }
}
