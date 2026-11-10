import test from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";

import { BrowserAuthService } from "../src/browser-auth";
import { isUuidV7 } from "../src/user-id";

const HEADER_ID = "018f2c3d-4e5f-7a6b-8c9d-0e1f2a3b4c5d";
const QUERY_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const SESSION_ID = "01a1b2c3-d4e5-7f60-8a1b-2c3d4e5f6a7b";

interface Harness {
  readonly ctx: Context;
  readonly ensured: string[];
  readonly looked: string[];
}

async function start(options: {
  readonly verifySession?: (token: string) => string | null;
  readonly lookupFound?: boolean;
} = {}): Promise<Harness> {
  const ensured: string[] = [];
  const looked: string[] = [];
  const ctx = new Context();
  await ctx.plugin(BrowserAuthService, {
    cookieName: "ads-easy-session",
    verifySession: (token) => {
      if (options.verifySession !== undefined) return options.verifySession(token);
      return token === "good" ? SESSION_ID : null;
    },
    lookupUser: (userId) => {
      looked.push(userId);
      return options.lookupFound === false ? null : { id: userId };
    },
    ensureUser: (userId) => {
      ensured.push(userId);
      return { id: userId };
    },
  });
  return { ctx, ensured, looked };
}

test("a valid session cookie wins over the anonymous header", async () => {
  const { ctx, ensured, looked } = await start();
  try {
    const identity = await ctx.browserAuth.resolve({
      cookie: "ads-easy-session=good",
      headerUserId: HEADER_ID,
    });
    assert.deepEqual(identity, {
      userId: SESSION_ID,
      authenticated: true,
      anonymous: false,
      minted: false,
    });
    assert.deepEqual(looked, [SESSION_ID]);
    assert.deepEqual(ensured, []);
  } finally {
    await ctx.fiber.dispose();
  }
});

test("a valid UUIDv7 x-user-id header is accepted without minting", async () => {
  const { ctx, ensured } = await start();
  try {
    const identity = await ctx.browserAuth.resolve({ headerUserId: HEADER_ID });
    assert.deepEqual(identity, {
      userId: HEADER_ID,
      authenticated: false,
      anonymous: true,
      minted: false,
    });
    assert.deepEqual(ensured, [HEADER_ID]);
  } finally {
    await ctx.fiber.dispose();
  }
});

test("a valid UUIDv7 userId query is accepted", async () => {
  const { ctx, ensured } = await start();
  try {
    const identity = await ctx.browserAuth.resolve({ queryUserId: QUERY_ID });
    assert.equal(identity.userId, QUERY_ID);
    assert.equal(identity.minted, false);
    assert.deepEqual(ensured, [QUERY_ID]);
  } finally {
    await ctx.fiber.dispose();
  }
});

test("the header takes precedence over the query parameter", async () => {
  const { ctx } = await start();
  try {
    const identity = await ctx.browserAuth.resolve({
      headerUserId: HEADER_ID,
      queryUserId: QUERY_ID,
    });
    assert.equal(identity.userId, HEADER_ID);
  } finally {
    await ctx.fiber.dispose();
  }
});

test("a missing or malformed id mints a UUIDv7", async () => {
  const { ctx, ensured } = await start();
  try {
    for (const request of [
      {},
      { headerUserId: "not-a-uuid" },
      { headerUserId: "018f2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d" },
      { queryUserId: "1234" },
    ]) {
      ensured.length = 0;
      const identity = await ctx.browserAuth.resolve(request);
      assert.equal(identity.anonymous, true);
      assert.equal(identity.authenticated, false);
      assert.equal(identity.minted, true);
      assert.equal(isUuidV7(identity.userId), true);
      assert.deepEqual(ensured, [identity.userId]);
    }
  } finally {
    await ctx.fiber.dispose();
  }
});

test("an invalid session token falls through to the anonymous identity", async () => {
  const { ctx } = await start({ verifySession: () => null });
  try {
    const identity = await ctx.browserAuth.resolve({
      cookie: "ads-easy-session=stale",
      headerUserId: HEADER_ID,
    });
    assert.equal(identity.userId, HEADER_ID);
    assert.equal(identity.authenticated, false);
    assert.equal(identity.anonymous, true);
  } finally {
    await ctx.fiber.dispose();
  }
});

test("a verified session whose user is gone falls through to anonymous", async () => {
  const { ctx } = await start({ lookupFound: false });
  try {
    const identity = await ctx.browserAuth.resolve({
      cookie: "ads-easy-session=good",
      headerUserId: HEADER_ID,
    });
    assert.equal(identity.userId, HEADER_ID);
    assert.equal(identity.minted, false);
  } finally {
    await ctx.fiber.dispose();
  }
});

test("authenticate still reports null without a session cookie", async () => {
  const { ctx } = await start();
  try {
    assert.equal(await ctx.browserAuth.authenticate(undefined), null);
    assert.equal(
      await ctx.browserAuth.authenticate("ads-easy-session=good"),
      SESSION_ID,
    );
  } finally {
    await ctx.fiber.dispose();
  }
});
