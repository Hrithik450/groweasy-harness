/**
 * Google OAuth 2.0 and OpenID Connect helpers.
 *
 * Every function is transport-free: it receives its client credentials and
 * redirect URI as arguments, uses the platform `fetch`, and returns plain data.
 * The host owns environment reading, the request/response objects, and the
 * cookie that carries the result.
 *
 * @module @openai-harness/google-account/oauth
 */

/** The user facts Google's OpenID userinfo endpoint supplies. */
export interface GoogleUserProfile {
  /** Stable OpenID subject id. */
  sub: string;
  /** Confirmed email address. */
  email: string;
  /** Display name. */
  name: string;
  /** Avatar URL, when Google supplies one. */
  picture?: string | undefined;
  /** Whether Google reports the email as verified. */
  emailVerified?: boolean | undefined;
}

/** The tokens one authorization-code exchange yields. */
export interface GoogleTokens {
  /** Bearer token for Google APIs. */
  accessToken: string;
  /** The signed OpenID Connect identity token, when Google returns one. */
  idToken?: string | undefined;
  /** Offline refresh token, present only when the flow requested offline access. */
  refreshToken?: string | undefined;
  /** Access-token lifetime in seconds. */
  expiresIn?: number | undefined;
}

/** Optional knobs for {@link getGoogleAuthUrl}; the defaults match Google's recommended offline flow. */
export interface GoogleAuthUrlOptions {
  /** Scope list; defaults to `openid email profile`. */
  readonly scopes?: readonly string[];
  /** Consent prompt behavior; defaults to `select_account`. */
  readonly prompt?: string;
  /** Offline access request; defaults to `offline`. */
  readonly accessType?: string;
}

/** Scopes the default authorization URL requests. */
export const DEFAULT_GOOGLE_SCOPES = ["openid", "email", "profile"] as const;

/**
 * Generate a Google OAuth 2.0 authorization URL.
 *
 * @param clientId - Google OAuth client id.
 * @param redirectUri - authorized redirect URI.
 * @param state - anti-CSRF state token, echoed back on the callback.
 * @param options - optional scope, prompt, and access-type overrides.
 * @returns the fully composed authorization URL.
 */
export function getGoogleAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  options: GoogleAuthUrlOptions = {},
): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    (options.scopes ?? DEFAULT_GOOGLE_SCOPES).join(" "),
  );
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", options.accessType ?? "offline");
  url.searchParams.set("prompt", options.prompt ?? "select_account");
  return url.toString();
}

/**
 * Exchange an authorization code for Google access and identity tokens.
 *
 * @param clientId - Google OAuth client id.
 * @param clientSecret - Google OAuth client secret.
 * @param redirectUri - authorized redirect URI; must match the one the code was issued for.
 * @param code - authorization code received on the callback.
 * @returns the token set Google issued.
 * @throws Error when Google rejects the exchange.
 */
export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<GoogleTokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google token exchange failed (${String(response.status)}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetch the user profile behind a Google access token.
 *
 * @param accessToken - a valid Google access token.
 * @returns the OpenID userinfo facts.
 * @throws Error when Google rejects the request.
 */
export async function fetchGoogleUserProfile(
  accessToken: string,
): Promise<GoogleUserProfile> {
  const response = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google userinfo request failed (${String(response.status)}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    sub: string;
    email: string;
    name: string;
    picture?: string;
    email_verified?: boolean;
  };

  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    picture: data.picture,
    emailVerified: data.email_verified,
  };
}
