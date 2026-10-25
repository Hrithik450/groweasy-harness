/** Google OAuth 2.0 and OpenID Connect helpers. @module @deepseek-ai/dsh-google-account/oauth */
/**
 * Generate Google OAuth 2.0 authorization URL.
 * @param clientId - Google OAuth Client ID
 * @param redirectUri - Authorized redirect URI
 * @param state - Anti-CSRF state token
 */
export function getGoogleAuthUrl(clientId, redirectUri, state) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
}
/**
 * Exchange authorization code for Google access and ID tokens.
 * @param clientId - Google OAuth Client ID
 * @param clientSecret - Google OAuth Client Secret
 * @param redirectUri - Authorized redirect URI
 * @param code - Authorization code received from Google callback
 */
export async function exchangeCodeForTokens(clientId, clientSecret, redirectUri, code) {
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
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google token exchange failed (${response.status}): ${errorText}`);
    }
    const data = (await response.json());
    return {
        accessToken: data.access_token,
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
    };
}
/**
 * Fetch user profile from Google OpenID Connect endpoint.
 * @param accessToken - Valid Google access token
 */
export async function fetchGoogleUserProfile(accessToken) {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google userinfo request failed (${response.status}): ${errorText}`);
    }
    const data = (await response.json());
    return {
        sub: data.sub,
        email: data.email,
        name: data.name,
        picture: data.picture,
        emailVerified: data.email_verified,
    };
}
//# sourceMappingURL=oauth.js.map