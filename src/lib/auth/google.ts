import { OAuth2Client } from "google-auth-library";

export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  emailVerified: boolean;
}

function getGoogleClientId(): string | undefined {
  return (
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    undefined
  );
}

function getGoogleClientSecret(): string | undefined {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
}

/**
 * Verifies a Google One-Tap or Google Sign-In ID token (JWT)
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

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error("Invalid Google ID token payload.");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split("@")[0],
    picture: payload.picture || "",
    emailVerified: !!payload.email_verified,
  };
}

/**
 * Builds Google OAuth 2.0 authorization URL for standard redirect callback flow.
 */
export function getGoogleOAuthLoginUrl(origin: string, state?: string): string {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

  const redirectUri = `${origin}/api/auth/google/callback`;
  const client = new OAuth2Client(
    clientId,
    getGoogleClientSecret(),
    redirectUri,
  );

  return client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state: state || "/",
    prompt: "consent",
  });
}

/**
 * Exchanges authorization code for user profile in the redirect callback.
 */
export async function exchangeGoogleCodeForUser(
  code: string,
  origin: string,
): Promise<GoogleIdentity> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const redirectUri = `${origin}/api/auth/google/callback`;

  const client = new OAuth2Client(clientId, clientSecret, redirectUri);
  const { tokens } = await client.getToken(code);

  if (!tokens.id_token) {
    throw new Error("No ID token returned from Google token exchange.");
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error("Invalid Google token payload during code exchange.");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split("@")[0],
    picture: payload.picture || "",
    emailVerified: !!payload.email_verified,
  };
}
