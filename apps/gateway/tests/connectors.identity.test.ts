/**
 * Route-level tests for connector identity resolution.
 *
 * A guest browser mints a UUIDv7, persists it in the `oh-user-id` cookie, and
 * completes OAuth against the Gateway origin. The callback resolves that user
 * through the identity cookie, so the connector row is saved under it. Listing
 * connectors afterwards must resolve the *same* identity — from the cookie as
 * well as the legacy headers/query — or the UI shows every connector as
 * disconnected even though the row exists.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { WebServer } from "@openai-harness/host-webserver";
import Storage from "@openai-harness/storage";
import * as storageJson from "@openai-harness/storage-json";
import * as storageDomain from "@openai-harness/storage-domain";
import { ConnectorService } from "@openai-harness/connector";
import { getOrCreateAnonymousUser } from "@openai-harness/google-account";

// Keep the identity store and both storage media out of the development data.
const root = await mkdtemp(path.join(tmpdir(), "gateway-connectors-identity-"));
process.env.DATA_ROOT = root;
process.env.DATABASE_PATH = ":memory:";

const { ConnectorsShopifyService } = await import(
  "../src/routes/connectors.shopify.plugin"
);
const { ConnectorsMetaService } = await import(
  "../src/routes/connectors.meta.plugin"
);

/** A canonical UUIDv7 the way the browser mints it. */
const ANONYMOUS_USER_ID = "018f4c2a-7b3d-7c4e-8f01-2a3b4c5d6e7f";

interface Running {
  readonly ctx: Context;
  readonly origin: string;
}

async function start(): Promise<Running> {
  const ctx = new Context();
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  await ctx.plugin(Storage);
  await ctx.plugin(storageJson, { root: path.join(root, "storage") });
  await ctx.plugin(storageDomain, { backend: "json" });
  await ctx.plugin(ConnectorService);
  await ctx.plugin(ConnectorsShopifyService);
  await ctx.plugin(ConnectorsMetaService);
  const port = ctx.webServer.port;
  if (port === undefined) throw new Error("webserver did not bind");
  return { ctx, origin: `http://127.0.0.1:${String(port)}` };
}

/** Seed the anonymous user row and the connector the OAuth callback saved. */
async function seed(running: Running): Promise<void> {
  const user = getOrCreateAnonymousUser(ANONYMOUS_USER_ID);
  assert.equal(user.success, true);

  const saved = await running.ctx.connectors.upsert({
    userId: ANONYMOUS_USER_ID,
    slug: "metaAds",
    providerSlug: "meta",
    status: "connected",
    accessToken: "meta-access-token",
    refreshToken: "meta-refresh-token",
    permissions: ["read_insights", "ads_management", "ads_read"],
    metadata: { adAccounts: [{ id: "act_1", name: "Test account" }] },
  });
  assert.equal(saved.status, "connected");
}

test("GET /api/connectors resolves the browser identity cookie", async () => {
  const running = await start();
  try {
    await seed(running);

    const response = await fetch(`${running.origin}/api/connectors`, {
      headers: { cookie: `oh-user-id=${ANONYMOUS_USER_ID}` },
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      connectors?: Array<Record<string, unknown>>;
    };
    const meta = body.connectors?.find((row) => row.slug === "metaAds");
    assert.ok(meta, "the saved Meta connector must be returned");
    assert.equal(meta.status, "connected");
    assert.deepEqual(meta.permissions, [
      "read_insights",
      "ads_management",
      "ads_read",
    ]);
  } finally {
    await running.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("GET /api/connectors keeps the header and query identity fallbacks", async () => {
  const running = await start();
  try {
    await seed(running);

    for (const [name, url, headers] of [
      [
        "x-user-id",
        `${running.origin}/api/connectors`,
        { "x-user-id": ANONYMOUS_USER_ID },
      ],
      [
        "x-anonymous-user-id",
        `${running.origin}/api/connectors`,
        { "x-anonymous-user-id": ANONYMOUS_USER_ID },
      ],
      [
        "userId query",
        `${running.origin}/api/connectors?userId=${ANONYMOUS_USER_ID}`,
        {},
      ],
      [
        "anonymousUserId query",
        `${running.origin}/api/connectors?anonymousUserId=${ANONYMOUS_USER_ID}`,
        {},
      ],
    ] as const) {
      const response = await fetch(url, { headers });
      assert.equal(response.status, 200, name);
      const body = (await response.json()) as {
        connectors?: Array<{ slug: string }>;
      };
      assert.equal(body.connectors?.[0]?.slug, "metaAds", name);
    }
  } finally {
    await running.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("GET /api/connectors still answers 401 for an unknown or malformed identity", async () => {
  const running = await start();
  try {
    await seed(running);

    const malformed = await fetch(`${running.origin}/api/connectors`, {
      headers: { cookie: "oh-user-id=not-a-uuidv7" },
    });
    assert.equal(malformed.status, 401);

    const unknown = await fetch(`${running.origin}/api/connectors`, {
      headers: {
        cookie: "oh-user-id=018f4c2a-7b3d-7c4e-8f01-000000000000",
      },
    });
    assert.equal(unknown.status, 401);
  } finally {
    await running.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("connector routes admit the browser origin and answer its preflight", async () => {
  const running = await start();
  try {
    await seed(running);
    const appOrigin = "http://localhost:5173";

    const preflight = await fetch(
      `${running.origin}/api/connectors/business.profile/disconnect`,
      {
        method: "OPTIONS",
        headers: {
          origin: appOrigin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      },
    );
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("access-control-allow-origin"),
      appOrigin,
    );
    assert.equal(
      preflight.headers.get("access-control-allow-credentials"),
      "true",
    );
    assert.match(
      preflight.headers.get("access-control-allow-headers") ?? "",
      /content-type/,
    );

    // The post-connect activation POST is JSON, so the browser preflights it.
    const metaActivation = await fetch(
      `${running.origin}/api/connectors/meta/connect`,
      {
        method: "OPTIONS",
        headers: {
          origin: appOrigin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      },
    );
    assert.equal(metaActivation.status, 204);
    assert.equal(
      metaActivation.headers.get("access-control-allow-origin"),
      appOrigin,
    );

    const read = await fetch(`${running.origin}/api/connectors`, {
      headers: {
        origin: appOrigin,
        cookie: `oh-user-id=${ANONYMOUS_USER_ID}`,
      },
    });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("access-control-allow-origin"), appOrigin);
    assert.equal(
      read.headers.get("access-control-allow-credentials"),
      "true",
    );

    const foreign = await fetch(`${running.origin}/api/connectors`, {
      headers: { origin: "http://evil.test" },
    });
    assert.equal(foreign.status, 403);
  } finally {
    await running.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("GET /api/connectors/business.profile heals an orphaned running analysis", async () => {
  const running = await start();
  try {
    getOrCreateAnonymousUser(ANONYMOUS_USER_ID);
    await running.ctx.connectors.upsert({
      userId: ANONYMOUS_USER_ID,
      slug: "businessProfile",
      providerSlug: "adsEasy",
      status: "disconnected",
      syncStatus: "running",
      syncStartedAt: new Date().toISOString(),
    });

    const response = await fetch(
      `${running.origin}/api/connectors/business.profile`,
      { headers: { cookie: `oh-user-id=${ANONYMOUS_USER_ID}` } },
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      connector?: {
        status?: string;
        syncStatus?: string;
        metadata?: { error?: string } | null;
      } | null;
    };
    assert.equal(body.connector?.syncStatus, "idle");
    assert.equal(body.connector?.status, "disconnected");
    assert.match(body.connector?.metadata?.error ?? "", /interrupted/i);
  } finally {
    await running.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("GET /api/connectors heals an orphaned running analysis without a profile", async () => {
  const running = await start();
  try {
    getOrCreateAnonymousUser(ANONYMOUS_USER_ID);
    await running.ctx.connectors.upsert({
      userId: ANONYMOUS_USER_ID,
      slug: "businessProfile",
      providerSlug: "adsEasy",
      status: "disconnected",
      syncStatus: "running",
    });

    const response = await fetch(`${running.origin}/api/connectors`, {
      headers: { cookie: `oh-user-id=${ANONYMOUS_USER_ID}` },
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      connectors?: Array<{
        slug: string;
        status?: string;
        syncStatus?: string;
        metadata?: { error?: string } | null;
      }>;
    };
    const profile = body.connectors?.find((row) => row.slug === "businessProfile");
    assert.ok(profile, "the Business Profile row must be returned");
    assert.equal(profile.syncStatus, "idle");
    assert.equal(profile.status, "disconnected");
    assert.match(profile.metadata?.error ?? "", /interrupted/i);
  } finally {
    await running.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("GET /api/connectors/business.profile keeps a saved profile when healing", async () => {
  const running = await start();
  try {
    getOrCreateAnonymousUser(ANONYMOUS_USER_ID);
    const profile = {
      url: "https://example.test",
      brand: {
        name: "Example",
        overview: "An example business.",
        theme: { primary: "#111111", primaryAccent: "#eeeeee" },
      },
      geography: { scope: "nationwide" },
    };
    await running.ctx.connectors.upsert({
      userId: ANONYMOUS_USER_ID,
      slug: "businessProfile",
      providerSlug: "adsEasy",
      status: "connected",
      syncStatus: "running",
      syncStartedAt: new Date().toISOString(),
      metadata: profile,
    });

    const response = await fetch(
      `${running.origin}/api/connectors/business.profile`,
      { headers: { cookie: `oh-user-id=${ANONYMOUS_USER_ID}` } },
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      connector?: {
        status?: string;
        syncStatus?: string;
        metadata?: Record<string, unknown> | null;
      } | null;
    };
    assert.equal(body.connector?.status, "connected");
    assert.equal(body.connector?.syncStatus, "idle");
    assert.deepEqual(body.connector?.metadata, profile);
  } finally {
    await running.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("GET /api/connectors never exposes connector tokens", async () => {
  const running = await start();
  try {
    await seed(running);

    const response = await fetch(`${running.origin}/api/connectors`, {
      headers: { cookie: `oh-user-id=${ANONYMOUS_USER_ID}` },
    });
    assert.equal(response.status, 200);

    const text = await response.text();
    assert.equal(text.includes("meta-access-token"), false);
    assert.equal(text.includes("meta-refresh-token"), false);

    const body = JSON.parse(text) as {
      connectors?: Array<Record<string, unknown>>;
    };
    const meta = body.connectors?.find((row) => row.slug === "metaAds");
    assert.ok(meta);
    assert.equal("accessToken" in meta, false);
    assert.equal("refreshToken" in meta, false);
  } finally {
    await running.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
