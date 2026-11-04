import test from "node:test";
import assert from "node:assert/strict";

import { exchangeCodeForTokens, getGoogleAuthUrl } from "../src/oauth";

/** Runs `run` with `fetch` replaced, restoring the original afterwards. */
async function withFetch(
  replacement: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = replacement;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("the authorization URL carries the caller's client, redirect, and state", () => {
  const url = new URL(
    getGoogleAuthUrl("client-1", "https://app.test/callback", "state-1"),
  );

  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.pathname, "/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "client-1");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.test/callback");
  assert.equal(url.searchParams.get("state"), "state-1");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("access_type"), "offline");
});

test("scope, prompt, and access type can be overridden", () => {
  const url = new URL(
    getGoogleAuthUrl("client-1", "https://app.test/callback", "state-1", {
      scopes: ["openid", "profile"],
      prompt: "consent",
      accessType: "online",
    }),
  );

  assert.equal(url.searchParams.get("scope"), "openid profile");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("access_type"), "online");
});

test("the code exchange maps Google's token response", async () => {
  await withFetch(
    (async () =>
      new Response(
        JSON.stringify({
          access_token: "access-1",
          id_token: "id-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch,
    async () => {
      assert.deepEqual(
        await exchangeCodeForTokens(
          "client-1",
          "secret-1",
          "https://app.test/callback",
          "code-1",
        ),
        {
          accessToken: "access-1",
          idToken: "id-1",
          refreshToken: "refresh-1",
          expiresIn: 3600,
        },
      );
    },
  );
});

test("a rejected code exchange surfaces Google's status", async () => {
  await withFetch(
    (async () =>
      new Response("invalid_grant", { status: 400 })) as unknown as typeof fetch,
    async () => {
      await assert.rejects(
        exchangeCodeForTokens(
          "client-1",
          "secret-1",
          "https://app.test/callback",
          "bad-code",
        ),
        /Google token exchange failed \(400\)/,
      );
    },
  );
});
