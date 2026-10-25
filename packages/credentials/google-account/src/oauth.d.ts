/** Google OAuth 2.0 and OpenID Connect helpers. @module @deepseek-ai/dsh-google-account/oauth */
export interface GoogleUserProfile {
    sub: string;
    email: string;
    name: string;
    picture?: string | undefined;
    emailVerified?: boolean | undefined;
}
export interface GoogleTokens {
    accessToken: string;
    idToken?: string | undefined;
    refreshToken?: string | undefined;
    expiresIn?: number | undefined;
}
/**
 * Generate Google OAuth 2.0 authorization URL.
 * @param clientId - Google OAuth Client ID
 * @param redirectUri - Authorized redirect URI
 * @param state - Anti-CSRF state token
 */
export declare function getGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string;
/**
 * Exchange authorization code for Google access and ID tokens.
 * @param clientId - Google OAuth Client ID
 * @param clientSecret - Google OAuth Client Secret
 * @param redirectUri - Authorized redirect URI
 * @param code - Authorization code received from Google callback
 */
export declare function exchangeCodeForTokens(clientId: string, clientSecret: string, redirectUri: string, code: string): Promise<GoogleTokens>;
/**
 * Fetch user profile from Google OpenID Connect endpoint.
 * @param accessToken - Valid Google access token
 */
export declare function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile>;
//# sourceMappingURL=oauth.d.ts.map