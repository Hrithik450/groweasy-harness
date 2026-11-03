import test from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";

import Storage, {
  BackendRegistry,
  storageBackendServiceKey,
  type StorageBackend,
} from "../src/index";

const fakeBackend = (): StorageBackend => ({ close: async () => {} });

function hasCode(code: string) {
  return (error: unknown): boolean =>
    (error as { code?: string }).code === code;
}

test("registers, resolves, and disposes names", () => {
  const registry = new BackendRegistry();
  const backend = fakeBackend();
  const dispose = registry.register("json", backend);

  assert.equal(registry.get("json"), backend);
  assert.deepEqual(registry.names(), ["json"]);

  dispose();
  assert.deepEqual(registry.names(), []);
  assert.throws(() => registry.get("json"), hasCode("backend-not-found"));
});

test("rejects duplicate backend names", () => {
  const registry = new BackendRegistry();
  registry.register("json", fakeBackend());
  assert.throws(
    () => registry.register("json", fakeBackend()),
    hasCode("duplicate-backend"),
  );
});

test("derives stable lifecycle service keys for named backends", () => {
  assert.equal(storageBackendServiceKey("json"), "storage.backend.json");
  assert.equal(storageBackendServiceKey("tenant-a"), "storage.backend.tenant-a");
});

test("mounts on the context and exposes registry plus form mounting", async () => {
  const ctx = new Context();
  await ctx.plugin(Storage);
  assert.ok(ctx.storage instanceof Storage);

  const facility = { marker: true };
  const dispose = ctx.storage.mount("domain" as never, facility as never);
  assert.equal(ctx.storage.form("domain" as never), facility);
  assert.equal(ctx.storage.domain, facility);
  assert.throws(
    () => ctx.storage.mount("domain" as never, facility as never),
    hasCode("duplicate-mount"),
  );

  dispose();
  assert.throws(
    () => ctx.storage.form("domain" as never),
    hasCode("form-not-mounted"),
  );
  assert.throws(() => ctx.storage.domain, hasCode("form-not-mounted"));
});

test("ignores a stale disposer after dispose and re-register / re-mount", async () => {
  const ctx = new Context();
  await ctx.plugin(Storage);

  const first = { first: true };
  const second = { second: true };
  const staleMount = ctx.storage.mount("domain" as never, first as never);
  staleMount();
  ctx.storage.mount("domain" as never, second as never);
  staleMount();
  assert.equal(ctx.storage.form("domain" as never), second);

  const backendA = fakeBackend();
  const backendB = fakeBackend();
  const staleRegister = ctx.storage.backend.register("json", backendA);
  staleRegister();
  ctx.storage.backend.register("json", backendB);
  staleRegister();
  assert.equal(ctx.storage.backend.get("json"), backendB);
});
