/** Google OAuth 2.0 and OpenID Connect helpers. @module @deepseek-ai/dsh-google-account/oauth */

export interface GoogleUserProfile {
  sub: string
  email: string
  name: string
  picture?: string | undefined
  emailVerified?: boolean | undefined
}

export interface GoogleTokens {
  accessToken: string
  idToken?: string | undefined
  refreshToken?: string | undefined
  expiresIn?: number | undefined
}

/**
 * Generate Google OAuth 2.0 authorization URL.
 * @param clientId - Google OAuth Client ID
 * @param redirectUri - Authorized redirect URI
 * @param state - Anti-CSRF state token
 */
export function getGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

/**
 * Exchange authorization code for Google access and ID tokens.
 * @param clientId - Google OAuth Client ID
 * @param clientSecret - Google OAuth Client Secret
 * @param redirectUri - Authorized redirect URI
 * @param code - Authorization code received from Google callback
 */
export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<GoogleTokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google token exchange failed (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as {
    access_token: string
    id_token?: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/**
 * Fetch user profile from Google OpenID Connect endpoint.
 * @param accessToken - Valid Google access token
 */
export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google userinfo request failed (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as {
    sub: string
    email: string
    name: string
    picture?: string
    email_verified?: boolean
  }

  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    picture: data.picture,
    emailVerified: data.email_verified,
  }
}
