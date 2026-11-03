import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";
import { z } from "zod";

import Storage, {
  storageBackendServiceKey,
} from "@openai-harness/storage";

import {
  apply,
  defineDomain,
  descriptorOf,
  DomainFacility,
  domainTable,
} from "../src/index";
import type { Config } from "../src/index";
import type { DomainChanged } from "../src/events";
import { MemoryMediaPool, MemoryStorageBackend } from "./helpers/memory-backend";

const itemSchema = z.object({ label: z.string(), count: z.number().int() });
type Item = z.infer<typeof itemSchema>;

const settingsSchema = z.object({ theme: z.string() });

const spec = defineDomain({
  name: "demo",
  version: 1,
  global: { schema: settingsSchema, initial: { theme: "plain" } },
  tables: { items: domainTable<string, Item>(itemSchema) },
});

const bareSpec = defineDomain({
  name: "bare",
  version: 1,
  tables: { rows: domainTable<string, Item>(itemSchema) },
});

/** Poll an assertion until it passes or the deadline expires. */
async function waitFor(assertion: () => void, timeout = 2_000): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

/** Boot a context with the storage hub, one memory backend, and a facility over it. */
async function harness(options?: {
  pool?: MemoryMediaPool;
  config?: Partial<Config>;
}) {
  const ctx = new Context();
  await ctx.plugin(Storage);
  const backend = new MemoryStorageBackend(options?.pool);
  ctx.storage.backend.register("memory", backend);
  const facility = new DomainFacility(ctx, {
    backend: "memory",
    routes: {},
    ...options?.config,
  });
  ctx.storage.mount("domain", facility);
  const changes: DomainChanged[] = [];
  ctx.on("domain/changed", (change) => {
    changes.push(change);
  });
  return { ctx, backend, facility, changes };
}

describe("defineDomain", () => {
  it("rejects invalid names and versions loudly", () => {
    assert.throws(
      () => defineDomain({ name: "Bad-Name", version: 1, tables: {} }),
      /must match/,
    );
    assert.throws(
      () => defineDomain({ name: "ok", version: 1.5, tables: {} }),
      /non-negative integer/,
    );
    assert.throws(
      () =>
        defineDomain({
          name: "ok",
          version: 1,
          tables: { "Bad Table": domainTable<string, Item>(itemSchema) },
        }),
      /table name/,
    );
  });

  it("rejects a global schema that accepts null (the never-written sentinel)", () => {
    assert.throws(
      () =>
        defineDomain({
          name: "ok",
          version: 1,
          global: { schema: settingsSchema.nullable(), initial: null },
          tables: {},
        }),
      /must not accept null/,
    );
  });

  it("validates compatibleVersions entries and projects them onto the descriptor", () => {
    assert.throws(
      () =>
        defineDomain({ name: "ok", version: 2, compatibleVersions: [1.5], tables: {} }),
      /compatibleVersions/,
    );
    assert.throws(
      () =>
        defineDomain({ name: "ok", version: 2, compatibleVersions: [2], tables: {} }),
      /below version/,
    );
    assert.throws(
      () => defineDomain({ name: "ok", version: 2, compatibleVersions: [-1], tables: {} }),
      /compatibleVersions/,
    );
    assert.deepEqual(
      descriptorOf(
        defineDomain({ name: "ok", version: 2, compatibleVersions: [0, 1], tables: {} }),
      ),
      { name: "ok", version: 2, tables: [], hasGlobal: false, compatibleVersions: [0, 1] },
    );
    // An undeclared set is absent from the descriptor.
    assert.equal("compatibleVersions" in descriptorOf(spec), false);
  });

  it("rejects an unknown invalidRecords policy", () => {
    assert.throws(
      () =>
        defineDomain({
          name: "ok",
          version: 1,
          invalidRecords: "zap" as "backup-and-skip",
          tables: {},
        }),
      /invalidRecords/,
    );
  });

  it("rejects an invalid layout and projects the declared one onto the descriptor", () => {
    // A spec built from config can carry any value; the union type is
    // compile-time only, so the runtime boundary check must reject it.
    assert.throws(
      () =>
        defineDomain({ name: "ok", version: 1, layout: "every-record" as "single", tables: {} }),
      /layout/,
    );
    assert.equal(
      descriptorOf(defineDomain({ name: "per", version: 1, layout: "per-record", tables: {} }))
        .layout,
      "per-record",
    );
    // The default (single) layout is absent from the descriptor.
    assert.equal("layout" in descriptorOf(spec), false);
  });
});

describe("DomainFacility.open", () => {
  it("opens, reads back stored records, and rejects a second open of the same name", async () => {
    const { facility } = await harness();
    const domain = await facility.open(spec);
    await domain.table("items").put("a", { label: "first", count: 1 });
    await assert.rejects(facility.open(spec), {
      name: "DomainError",
      code: "already-open",
    });
    assert.deepEqual(domain.table("items").get("a"), { label: "first", count: 1 });
  });

  it("routes per domain name and fails loud on an unregistered route target", async () => {
    const { facility } = await harness({ config: { routes: { demo: "nonexistent" } } });
    await assert.rejects(facility.open(spec), {
      name: "StorageError",
      code: "backend-not-found",
    });
    // The failed open releases the name for a later attempt.
    const { facility: healthy } = await harness();
    assert.ok((await healthy.open(spec)) !== undefined);
  });

  it("rejects a backend without the kv facet", async () => {
    const { ctx, facility } = await harness({ config: { backend: "nokv" } });
    ctx.storage.backend.register("nokv", { close: async () => {} });
    await assert.rejects(facility.open(spec), { code: "facet-unsupported" });
  });

  it("falls back to the default backend when no route table is configured", async () => {
    // A second, unmounted facility whose config omits `routes` entirely.
    const { ctx } = await harness();
    const routeless = new DomainFacility(ctx, { backend: "memory" });
    assert.ok((await routeless.open(bareSpec)) !== undefined);
  });

  it("treats a table key the backend omitted from loadAll as empty", async () => {
    // A sparse backend: loadAll omits declared table keys entirely instead of
    // returning them as empty objects.
    const { ctx, facility } = await harness({ config: { backend: "sparse" } });
    ctx.storage.backend.register("sparse", {
      kv: {
        open: async () => ({
          loadAll: async () => ({ tables: {}, global: null }),
          putRecord: async () => {},
          deleteRecord: async () => {},
          setGlobal: async () => {},
          close: async () => {},
        }),
      },
      close: async () => {},
    });
    const domain = await facility.open(bareSpec);
    assert.equal(domain.table("rows").size, 0);
  });

  it("rejects stored records that fail their schema, naming table and key", async () => {
    const pool = new MemoryMediaPool();
    {
      const { facility } = await harness({ pool });
      await (await facility.open(spec)).table("items").put("bad", { label: "x", count: 2 });
    }
    pool.media.get("demo")!.tables.get("items")!.set("bad", { label: "x", count: "NaN" });
    const { facility } = await harness({ pool });
    await assert.rejects(facility.open(spec), {
      code: "invalid-record",
      detail: { table: "items", key: "bad" },
    });
  });

  it("keeps the rejecting default under backup-and-skip when the backend cannot move documents", async () => {
    // The memory backend has no backupRecord, so the declared policy cannot
    // apply and the open falls back to failing loud.
    const salvageSpec = defineDomain({
      name: "salvage",
      version: 1,
      invalidRecords: "backup-and-skip",
      tables: { items: domainTable<string, Item>(itemSchema) },
    });
    const pool = new MemoryMediaPool();
    {
      const { facility } = await harness({ pool });
      await (await facility.open(salvageSpec)).table("items").put("bad", { label: "x", count: 2 });
    }
    pool.media.get("salvage")!.tables.get("items")!.set("bad", { label: "x", count: "NaN" });
    const { facility } = await harness({ pool });
    await assert.rejects(facility.open(salvageSpec), {
      code: "invalid-record",
      detail: { table: "items", key: "bad" },
    });
  });

  it("rejects a stored global that fails its schema with the global marker", async () => {
    const pool = new MemoryMediaPool();
    pool.versions.set("demo", 1);
    pool.media.set("demo", { tables: new Map(), global: { theme: 42 } });
    const { facility } = await harness({ pool });
    await assert.rejects(facility.open(spec), {
      code: "invalid-record",
      detail: { table: "", key: "" },
    });
  });

  it("passes through a backend version mismatch", async () => {
    const pool = new MemoryMediaPool();
    pool.versions.set("demo", 7);
    const { facility } = await harness({ pool });
    await assert.rejects(facility.open(spec), {
      name: "StorageError",
      code: "version-mismatch",
    });
  });
});

describe("plugin apply", () => {
  it("uses only the default backend when routes are omitted", async () => {
    const ctx = new Context();
    await ctx.plugin(Storage);
    const backend = new MemoryStorageBackend();
    ctx.storage.backend.register("memory", backend);
    const disposeBackend = ctx.provide(storageBackendServiceKey("memory"), backend);

    const fiber = await ctx.plugin({
      name: "storage-domain-routeless-test",
      inject: ["storage"],
      apply: (domainCtx: Context) => apply(domainCtx, { backend: "memory" }),
    });
    await waitFor(() => {
      assert.ok(ctx.storageDomain instanceof DomainFacility);
    });

    disposeBackend();
    await waitFor(() => {
      assert.equal(ctx.get("storageDomain"), undefined);
    });
    await fiber.dispose();
  });

  it("waits for routed backends, then mounts one lifecycle-bound service and form", async () => {
    const ctx = new Context();
    await ctx.plugin(Storage);
    const DomainPlugin = await import("../src/index");
    const fiber = await ctx.plugin(DomainPlugin, { backend: "memory" });
    assert.equal(ctx.get("storageDomain"), undefined);
    assert.throws(() => ctx.storage.form("domain"), /not mounted/);

    const backend = new MemoryStorageBackend();
    ctx.storage.backend.register("memory", backend);
    const disposeBackend = ctx.provide(storageBackendServiceKey("memory"), backend);
    await waitFor(() => {
      assert.ok(ctx.storageDomain instanceof DomainFacility);
    });
    assert.equal(ctx.storage.domain, ctx.storageDomain);

    disposeBackend();
    await waitFor(() => {
      assert.equal(ctx.get("storageDomain"), undefined);
      assert.throws(() => ctx.storage.form("domain"), /not mounted/);
    });
    await fiber.dispose();
  });
});

describe("table and snapshot reads", () => {
  it("serves entries, keys, and size as stable snapshots; unknown table names throw", async () => {
    const { facility } = await harness();
    const domain = await facility.open(spec);
    const table = domain.table("items");
    await table.put("a", { label: "x", count: 1 });
    await table.put("b", { label: "y", count: 2 });
    assert.equal(table.size, 2);
    assert.deepEqual([...table.keys()].sort(), ["a", "b"]);
    assert.deepEqual(new Map(table.entries()).get("a"), { label: "x", count: 1 });
    assert.throws(() => domain.table("nope" as never), /declares no table/);
  });
});

describe("KvTable writes", () => {
  it("serializes concurrent updates on one key without losing increments", async () => {
    const { facility } = await harness();
    const table = (await facility.open(spec)).table("items");
    await table.put("counter", { label: "c", count: 0 });
    await Promise.all(
      Array.from({ length: 50 }, () =>
        table.update("counter", (current) => ({
          ...current,
          count: current.count + 1,
        })),
      ),
    );
    assert.deepEqual(table.get("counter"), { label: "c", count: 50 });
  });

  it("update rejects a missing key; delete reports prior existence", async () => {
    const { facility } = await harness();
    const table = (await facility.open(spec)).table("items");
    await assert.rejects(table.update("ghost", (v) => v), { code: "missing-key" });
    await table.put("a", { label: "x", count: 1 });
    assert.equal(await table.delete("a"), true);
    assert.equal(await table.delete("a"), false);
  });

  it("emits domain/changed per durable write, in order, with tombstones and global marker", async () => {
    const { facility, changes } = await harness();
    const domain = await facility.open(spec);
    const table = domain.table("items");
    await table.put("a", { label: "x", count: 1 });
    await table.update("a", (current) => ({ ...current, count: 2 }));
    await table.delete("a");
    await table.delete("a"); // no event: already absent
    await domain.global.set({ theme: "dark" });
    assert.deepEqual(changes, [
      { domain: "demo", table: "items", key: "a", operation: "put", value: { label: "x", count: 1 } },
      { domain: "demo", table: "items", key: "a", operation: "put", value: { label: "x", count: 2 } },
      { domain: "demo", table: "items", key: "a", operation: "deleted" },
      { domain: "demo", table: "", key: "", operation: "put", value: { theme: "dark" } },
    ]);
  });
});

describe("durability failure", () => {
  it("leaves memory untouched and emits nothing when the backend rejects a write", async () => {
    const pool = new MemoryMediaPool();
    const { facility, changes } = await harness({ pool });
    const domain = await facility.open(spec);
    const table = domain.table("items");
    await table.put("a", { label: "x", count: 1 });
    const seen = changes.length;

    pool.failNextWrites = 3;
    await assert.rejects(table.put("a", { label: "x", count: 99 }), /injected/);
    await assert.rejects(
      table.update("a", (c) => ({ ...c, count: c.count + 1 })),
      /injected/,
    );
    await assert.rejects(table.delete("a"), /injected/);

    // Reads still serve the pre-failure record; no events leaked.
    assert.deepEqual(table.get("a"), { label: "x", count: 1 });
    assert.deepEqual(pool.media.get("demo")!.tables.get("items")!.get("a"), {
      label: "x",
      count: 1,
    });
    assert.equal(changes.length, seen);

    // The chain survives rejections: the next write lands cleanly with no residue.
    await table.update("a", (c) => ({ ...c, count: c.count + 1 }));
    assert.deepEqual(table.get("a"), { label: "x", count: 2 });
  });

  it("keeps serving initial when the first global set fails durability", async () => {
    const pool = new MemoryMediaPool();
    const { facility } = await harness({ pool });
    const domain = await facility.open(spec);
    pool.failNextWrites = 1;
    await assert.rejects(domain.global.set({ theme: "dark" }), /injected/);
    assert.deepEqual(domain.global.get(), { theme: "plain" });
    assert.equal(pool.media.get("demo")!.global, null);
  });
});

describe("global singleton", () => {
  it("serves initial before first set without materializing, then persists the first set", async () => {
    const pool = new MemoryMediaPool();
    {
      const { facility } = await harness({ pool });
      const domain = await facility.open(spec);
      assert.deepEqual(domain.global.get(), { theme: "plain" });
      assert.equal(pool.media.get("demo")!.global, null); // initial never touches the medium
      await domain.global.set({ theme: "dark" });
      assert.deepEqual(pool.media.get("demo")!.global, { theme: "dark" });
    }
    const { facility } = await harness({ pool });
    assert.deepEqual((await facility.open(spec)).global.get(), { theme: "dark" });
  });

  it("throws on access when the spec declares no global", async () => {
    const { facility } = await harness();
    const domain = await facility.open(bareSpec);
    assert.throws(() => (domain as { global: unknown }).global, /declares no global/);
  });
});

describe("close and lifecycle", () => {
  it("close drains queued writes, then rejects reads and writes, and frees the name", async () => {
    const pool = new MemoryMediaPool();
    const { facility } = await harness({ pool });
    const domain = await facility.open(spec);
    const table = domain.table("items");
    const pending = Promise.all([
      table.put("a", { label: "x", count: 1 }),
      table.put("b", { label: "y", count: 2 }),
    ]);
    await Promise.all([domain.close(), domain.close()]); // idempotent
    await pending; // queued before close → still landed
    // Durability is the drain contract: both queued writes reached the medium.
    assert.deepEqual(
      [...pool.media.get("demo")!.tables.get("items")!.keys()].sort(),
      ["a", "b"],
    );
    await assert.rejects(table.put("c", { label: "z", count: 3 }), { code: "closed" });
    assert.throws(() => table.get("a"), /closed/);
    // The name is free again: reopening sees the drained state.
    const reopened = await facility.open(spec);
    assert.deepEqual([...reopened.table("items").keys()].sort(), ["a", "b"]);
  });

  it("facility unmount closes domains the consumer never closed", async () => {
    const ctx = new Context();
    await ctx.plugin(Storage);
    const backend = new MemoryStorageBackend();
    ctx.storage.backend.register("memory", backend);
    ctx.provide(storageBackendServiceKey("memory"), backend);
    const DomainPlugin = await import("../src/index");
    const fiber = await ctx.plugin(DomainPlugin, { backend: "memory" });
    const domain = await ctx.storageDomain.open(bareSpec);
    const table = domain.table("rows");
    await table.put("a", { label: "x", count: 1 });
    await fiber.dispose();
    await assert.rejects(table.put("b", { label: "y", count: 2 }), { code: "closed" });
    assert.throws(() => ctx.storage.form("domain"), /not mounted/);
  });

  it("contains a throwing domain/changed listener without rejecting the committed write", async () => {
    const pool = new MemoryMediaPool();
    const { ctx, facility, changes } = await harness({ pool });
    const domain = await facility.open(spec);
    const table = domain.table("items");
    ctx.on("domain/changed", () => {
      throw new Error("hostile observer");
    });
    await assert.doesNotReject(table.put("a", { label: "x", count: 1 }));
    // Commit survived intact on both planes, and well-behaved listeners
    // (registered before the thrower) still observed the event.
    assert.deepEqual(table.get("a"), { label: "x", count: 1 });
    assert.deepEqual(pool.media.get("demo")!.tables.get("items")!.get("a"), {
      label: "x",
      count: 1,
    });
    assert.equal(changes.length, 1);
    // The chain is unpoisoned: subsequent writes proceed normally.
    assert.equal(await table.delete("a"), true);
  });
});
