/**
 * Connector repository/service tests against the real `connectors` domain
 * harness: tokens persist on the connector record, merge/clear semantics hold,
 * and mounting needs only the storage domain.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";

import Storage from "@openai-harness/storage";
import { DomainFacility } from "@openai-harness/storage-domain";

import { MemoryStorageBackend } from "../../../storage/storage-domain/tests/helpers/memory-backend";
import {
  connectorDomain,
  connectorKey,
  ConnectorRepository,
  ConnectorService,
} from "../src/index";

/** Boot a context with the storage hub, one memory backend, and an open domain. */
async function harness() {
  const ctx = new Context();
  await ctx.plugin(Storage);
  const backend = new MemoryStorageBackend();
  ctx.storage.backend.register("memory", backend);
  const facility = new DomainFacility(ctx, { backend: "memory", routes: {} });
  const domain = await facility.open(connectorDomain);
  const table = domain.table("connectors");
  const repository = new ConnectorRepository(domain);
  return { ctx, facility, domain, table, repository };
}

const userId = "user-1";
const key = connectorKey(userId, "metaAds");

describe("connector token storage on the domain record", () => {
  it("persists tokens and expiry directly on the connector record", async () => {
    const { ctx, domain, table, repository } = await harness();

    const connector = await repository.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: 1_700_000_000_000,
      permissions: ["ads_read"],
      metadata: { url: "https://example.test" },
    });

    assert.equal(connector.status, "connected");
    assert.equal(connector.accessToken, "access-1");
    assert.equal(connector.refreshToken, "refresh-1");
    assert.equal(connector.expiresAt, 1_700_000_000_000);

    const stored = table.get(key);
    assert.ok(stored !== undefined);
    assert.equal(stored.accessToken, "access-1");
    assert.equal(stored.refreshToken, "refresh-1");
    assert.equal(stored.expiresAt, 1_700_000_000_000);

    const read = await repository.getByProviderSlug(userId, "meta");
    assert.equal(read?.accessToken, "access-1");
    assert.equal(read?.expiresAt, 1_700_000_000_000);

    await domain.close();
    await ctx.fiber.dispose();
  });

  it("preserves tokens when the patch omits them", async () => {
    const { ctx, domain, repository } = await harness();

    await repository.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: 1_700_000_000_000,
    });

    const preserved = await repository.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      metadata: { adAccounts: [] },
    });

    assert.equal(preserved.accessToken, "access-1");
    assert.equal(preserved.refreshToken, "refresh-1");
    assert.equal(preserved.expiresAt, 1_700_000_000_000);
    assert.equal(preserved.status, "connected");

    await domain.close();
    await ctx.fiber.dispose();
  });

  it("keeps tokens when the provider slug changes because they live on the row", async () => {
    const { ctx, domain, table, repository } = await harness();

    await repository.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });

    const renamed = await repository.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta_ads",
    });

    assert.equal(renamed.providerSlug, "meta_ads");
    assert.equal(renamed.accessToken, "access-1");
    assert.equal(renamed.refreshToken, "refresh-1");
    assert.equal(table.get(key)?.accessToken, "access-1");

    await domain.close();
    await ctx.fiber.dispose();
  });

  it("clears only the fields explicitly nulled", async () => {
    const { ctx, domain, repository } = await harness();

    await repository.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: 1_700_000_000_000,
    });

    const cleared = await repository.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      refreshToken: null,
      expiresAt: null,
    });

    assert.equal(cleared.accessToken, "access-1");
    assert.equal(cleared.refreshToken, null);
    assert.equal(cleared.expiresAt, null);

    await domain.close();
    await ctx.fiber.dispose();
  });

  it("clears the whole token image on an explicit null access token", async () => {
    const { ctx, domain, repository } = await harness();

    await repository.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: 1_700_000_000_000,
    });

    const cleared = await repository.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      accessToken: null,
    });

    assert.equal(cleared.accessToken, null);
    assert.equal(cleared.refreshToken, null);
    assert.equal(cleared.expiresAt, null);
    // Status inference is unchanged: the caller sets it on disconnect.
    assert.equal(cleared.status, "connected");

    await domain.close();
    await ctx.fiber.dispose();
  });

  it("disconnect keeps the row but clears tokens and metadata", async () => {
    const { ctx, domain, table, repository } = await harness();

    await repository.upsert({
      userId,
      slug: "shopify",
      providerSlug: "shopify",
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: 1_700_000_000_000,
      permissions: ["read_products"],
      metadata: { shop: "example.myshopify.com" },
    });

    assert.equal(await repository.disconnectBySlug(userId, "shopify"), true);
    const stored = table.get(connectorKey(userId, "shopify"));
    assert.ok(stored !== undefined);
    assert.equal(stored.accessToken, null);
    assert.equal(stored.refreshToken, null);
    assert.equal(stored.expiresAt, null);
    assert.equal(stored.permissions, null);
    assert.equal(stored.metadata, null);
    assert.equal(stored.status, "disconnected");
    assert.equal(stored.syncStatus, "idle");

    assert.equal(await repository.disconnectBySlug(userId, "missing"), false);

    await domain.close();
    await ctx.fiber.dispose();
  });

  it("delete removes the row by slug or provider alias", async () => {
    const { ctx, domain, table, repository } = await harness();

    await repository.upsert({
      userId,
      slug: "businessProfile",
      providerSlug: "adsEasy",
      accessToken: "access-1",
      metadata: { url: "https://example.test" },
    });

    assert.equal(
      await repository.deleteBySlugOrProviderSlug(userId, "adsEasy"),
      true,
    );
    assert.equal(table.get(connectorKey(userId, "businessProfile")), undefined);
    assert.equal(
      await repository.deleteBySlugOrProviderSlug(userId, "adsEasy"),
      false,
    );

    await domain.close();
    await ctx.fiber.dispose();
  });
});

describe("ConnectorService mounting", () => {
  it("mounts with only the storage domain and serves stored tokens", async () => {
    const ctx = new Context();
    await ctx.plugin(Storage);
    const backend = new MemoryStorageBackend();
    ctx.storage.backend.register("memory", backend);
    const facility = new DomainFacility(ctx, { backend: "memory", routes: {} });
    ctx.provide("storageDomain", facility);

    await ctx.plugin(ConnectorService);
    assert.ok(ctx.connectors instanceof ConnectorService);

    const created = await ctx.connectors.upsert({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      accessToken: "access-service",
      expiresAt: 1_800_000_000_000,
    });
    assert.equal(created.accessToken, "access-service");

    const read = await ctx.connectors.getByProviderSlug(userId, "meta");
    assert.equal(read?.accessToken, "access-service");
    assert.equal(read?.expiresAt, 1_800_000_000_000);

    await ctx.fiber.dispose();
  });
});
