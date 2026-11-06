import test from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";
import {
  AttachmentId,
  DEFAULT_IMAGE_LIMITS,
} from "@openai-harness/attachment";

import {
  R2AttachmentStore,
  normalizeNamespace,
  type Config,
} from "../src/index";

const baseConfig: Config = {
  accountId: "account",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucketName: "bucket",
};

test("normalizeNamespace accepts nested prefixes and rejects escapes", () => {
  assert.equal(normalizeNamespace(undefined), "");
  assert.equal(normalizeNamespace("/openai-harness/t/user/"), "openai-harness/t/user");
  assert.throws(() => normalizeNamespace("a//b"), /Invalid R2 object namespace/);
  assert.throws(() => normalizeNamespace("a/../b"), /Invalid R2 object namespace/);
  assert.equal(normalizeNamespace("/"), "");
});

test("the store registers itself as ctx.attachments with config-derived limits", () => {
  const ctx = new Context();
  const store = new R2AttachmentStore(ctx, {
    ...baseConfig,
    namespace: "openai-harness/t/tenant",
    maxImageBytes: 123,
  });

  // Cordis exposes the registered service through a context proxy, so the
  // instance is identified by its service name and prototype.
  assert.equal(ctx.attachments.name, "attachments");
  assert.ok(ctx.attachments instanceof R2AttachmentStore);
  assert.equal(store.name, "attachments");
  assert.equal(store.namespace, "openai-harness/t/tenant");
  assert.equal(store.bucketName, "bucket");
  assert.equal(store.imageLimits.maxImageBytes, 123);
  assert.equal(
    store.imageLimits.maxImagesPerMessage,
    DEFAULT_IMAGE_LIMITS.maxImagesPerMessage,
  );
  assert.deepEqual(store.imageLimits.mediaTypes, DEFAULT_IMAGE_LIMITS.mediaTypes);
});

test("the Config schema fills limit defaults and requires credentials", () => {
  const resolved = R2AttachmentStore.Config(baseConfig) as Config;
  assert.equal(resolved.accountId, "account");
  assert.equal(resolved.maxImageBytes, DEFAULT_IMAGE_LIMITS.maxImageBytes);
  assert.equal(resolved.maxImageDimension, DEFAULT_IMAGE_LIMITS.maxImageDimension);
  assert.equal(resolved.namespace, undefined);

  assert.throws(() => R2AttachmentStore.Config({} as Config));
});

test("delivery URLs fall back to the authenticated app route or the CDN base", () => {
  const ref = {
    attachmentId: AttachmentId("sha256:" + "e".repeat(64)),
    mediaType: "image/png" as const,
    bytes: 1,
    width: 1,
    height: 1,
  };

  const local = new R2AttachmentStore(new Context(), baseConfig);
  assert.equal(local.getPublicUrl(ref), `/api/attachments/${ref.attachmentId}`);

  const cdn = new R2AttachmentStore(new Context(), {
    ...baseConfig,
    cdnBaseUrl: "https://media.example.com/",
  });
  assert.equal(
    cdn.getPublicUrl(ref),
    `https://media.example.com/attachments/${ref.attachmentId}`,
  );
});

test("video operations stay unsupported for the R2 provider", async () => {
  const store = new R2AttachmentStore(new Context(), baseConfig);
  await assert.rejects(
    store.saveVideo({ data: new Uint8Array(), mediaType: "video/mp4" }),
    { code: "STORAGE_UNSUPPORTED" },
  );
});
