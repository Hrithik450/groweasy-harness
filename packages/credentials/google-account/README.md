# @openai-harness/google-account

The pure half of Google sign-in: build the authorization URL, exchange the
authorization code for tokens, and fetch the OpenID userinfo profile.

Every function takes its client credentials and redirect URI as arguments and
returns plain data. No environment reads, no cookies, no request or response
objects, and no session state.

What it owns:

- `getGoogleAuthUrl` — the OAuth 2.0 authorization URL, with configurable
  scopes, prompt, and access type.
- `exchangeCodeForTokens` — the authorization-code exchange against
  `oauth2.googleapis.com/token`.
- `fetchGoogleUserProfile` — the OpenID Connect userinfo read.
- `GoogleTokens`, `GoogleUserProfile`, and the default scope list.

What stays in the application:

- Reading `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and deriving the redirect
  URI from the incoming request origin.
- Verifying an ID token against `google-auth-library` (both the One-Tap
  credential and the token returned by the code exchange).
- Writing the user row and setting the session cookie.
- The `src/app/api/auth/google/**` redirect handlers, which need Next's request
  and response objects.

Those live in `src/lib/auth/google.ts` as a host adapter that imports this
package.

Source reference: `packages/credentials/google-account/src/oauth.ts` in the
reference deepseek-harness repository.
