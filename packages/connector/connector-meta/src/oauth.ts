/**
 * Meta (Facebook) OAuth 2.0 Client & Helper Functions
 * Enables generic users to log in with Meta and grant marketing permissions.
 */

export function getMetaAppId(): string | undefined {
  return process.env.META_APP_ID?.trim() || undefined;
}

export function getMetaAppSecret(): string | undefined {
  return process.env.META_APP_SECRET?.trim() || undefined;
}

export const META_REQUIRED_SCOPES = [
  "ads_read",
  "read_insights",
  "ads_management",
];

export function isMetaOAuthConfigured(): boolean {
  return Boolean(getMetaAppId() && getMetaAppSecret());
}

/**
 * Builds Meta OAuth 2.0 authorization URL for standard redirect callback flow.
 */
export function getMetaOAuthLoginUrl(origin: string, state?: string): string {
  const appId = getMetaAppId();
  if (!appId) {
    throw new Error(
      "META_APP_ID is not configured in environment variables. Please configure META_APP_ID and META_APP_SECRET.",
    );
  }

  const redirectUri = `${origin}/api/auth/meta/callback`;
  const scope = META_REQUIRED_SCOPES.join(",");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scope,
    response_type: "code",
    state: state || "/",
  });

  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

/**
 * Exchanges authorization code for an access token and upgrades it to a long-lived (60-day) token.
 */
export async function exchangeMetaCodeForToken(
  code: string,
  origin: string,
): Promise<{ accessToken: string; expiresIn?: number; scope?: string }> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  const redirectUri = `${origin}/api/auth/meta/callback`;

  if (!appId || !appSecret) {
    throw new Error(
      "META_APP_ID or META_APP_SECRET is not configured in environment variables.",
    );
  }

  const tokenUrl = new URL(
    "https://graph.facebook.com/v19.0/oauth/access_token",
  );
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("code", code);

  const res = await fetch(tokenUrl.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Meta token exchange failed: ${res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in?: number;
  };

  const shortLivedToken = data.access_token;

  try {
    const longTokenUrl = new URL(
      "https://graph.facebook.com/v19.0/oauth/access_token",
    );
    longTokenUrl.searchParams.set("client_id", appId);
    longTokenUrl.searchParams.set("client_secret", appSecret);
    longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    longTokenUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longRes = await fetch(longTokenUrl.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (longRes.ok) {
      const longData = (await longRes.json()) as {
        access_token: string;
        expires_in?: number;
      };
      return {
        expiresIn: longData.expires_in,
        accessToken: longData.access_token,
        scope: META_REQUIRED_SCOPES.join(","),
      };
    }
  } catch (exchangeErr) {
    console.warn("[Meta OAuth] Long-lived exchange warning:", exchangeErr);
  }

  return {
    expiresIn: data.expires_in,
    accessToken: shortLivedToken,
    scope: META_REQUIRED_SCOPES.join(","),
  };
}
