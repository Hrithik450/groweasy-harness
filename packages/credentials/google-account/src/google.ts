/**
 * Google sign-in host adapter.
 *
 * The protocol half (authorization URL, code exchange, userinfo fetch) lives
 * in `./oauth`. This module keeps what the application's former
 * `src/lib/auth/google.ts` owned: its client credentials, the redirect URI
 * derived from the request origin, ID-token verification through
 * `google-auth-library`, and the application's identity shape.
 *
 * It is framework-free — no `next/*` import and no request object — so the
 * gateway and any other host can call the same functions.
 *
 * @module @openai-harness/google-account/google
 */

import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { exchangeCodeForTokens, getGoogleAuthUrl } from "./oauth";

/** The application's verified Google identity. */
export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  emailVerified: boolean;
}

/** Scopes this application requests; the package default differs. */
export const GOOGLE_LOGIN_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

/** Read the configured OAuth client id, preferring the server-only name. */
export function getGoogleClientId(): string | undefined {
  return (
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    undefined
  );
}

/** Read the configured OAuth client secret. */
export function getGoogleClientSecret(): string | undefined {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
}

/** Map a verified ID-token payload onto the application's identity. */
function toGoogleIdentity(payload: TokenPayload | undefined): GoogleIdentity {
  if (!payload || !payload.sub || !payload.email) {
    throw new Error("Invalid Google ID token payload.");
  }
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split("@")[0] || payload.email,
    picture: payload.picture || "",
    emailVerified: !!payload.email_verified,
  };
}

/**
 * Verify a Google One-Tap or Google Sign-In ID token (JWT).
 *
 * @param credential - the ID token supplied by Google.
 * @returns the verified identity.
 */
export async function verifyGoogleIdToken(
  credential: string,
): Promise<GoogleIdentity> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      "GOOGLE_CLIENT_ID is not configured in environment variables.",
    );
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId,
  });

  return toGoogleIdentity(ticket.getPayload());
}

/**
 * Build a Google OAuth 2.0 authorization URL for the redirect callback flow.
 *
 * @param origin - the request origin, used to derive the callback path.
 * @param state - opaque anti-CSRF / return-to payload.
 */
export function getGoogleOAuthLoginUrl(origin: string, state?: string): string {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

  return getGoogleAuthUrl(
    clientId,
    `${origin}/api/auth/google/callback`,
    state || "/",
    {
      scopes: GOOGLE_LOGIN_SCOPES,
      prompt: "consent",
    },
  );
}

/**
 * Exchange an authorization code for the verified Google identity.
 *
 * @param code - authorization code received on the callback.
 * @param origin - the request origin, used to derive the callback path.
 */
export async function exchangeGoogleCodeForUser(
  code: string,
  origin: string,
): Promise<GoogleIdentity> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }
  if (!clientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET is not configured.");
  }

  const tokens = await exchangeCodeForTokens(
    clientId,
    clientSecret,
    `${origin}/api/auth/google/callback`,
    code,
  );

  if (!tokens.idToken) {
    throw new Error("No ID token returned from Google token exchange.");
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: tokens.idToken,
    audience: clientId,
  });

  return toGoogleIdentity(ticket.getPayload());
}
