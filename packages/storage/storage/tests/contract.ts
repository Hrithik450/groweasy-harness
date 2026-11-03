/**
 * Shared KV-backend conformance suite. Each backend's test file calls
 * {@link runKvBackendContract} with a factory bound to its own medium; the
 * suite asserts every clause of the `src/backend.ts` contract so all backends
 * are held to identical semantics.
 * @module
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { KvUnitDescriptor, StorageBackend } from "../src/backend";

/** One conformance run: a fresh backend plus a way to reopen the same medium (crash simulation). */
export interface KvBackendContractHarness {
  /** The backend under test, freshly created over an empty medium. */
  backend: StorageBackend;
  /** Open a NEW backend instance over the SAME medium, as after a process restart. */
  reopen(): Promise<StorageBackend>;
}

/**
 * Normalize a record map for prototype-insensitive comparison: SQLite units
 * build their table maps with a null prototype (so `__proto__` records stay
 * own properties), which `assert.deepStrictEqual` distinguishes from `{}`.
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const DESCRIPTOR: KvUnitDescriptor = {
  name: "contract_unit",
  version: 3,
  tables: ["alpha", "beta"],
  hasGlobal: true,
};

/**
 * Run the shared conformance suite against one backend implementation.
 * @param label - Suite label, e.g. `json` / `sqlite`.
 * @param create - Factory producing a fresh harness per test.
 */
export function runKvBackendContract(
  label: string,
  create: () => Promise<KvBackendContractHarness>,
): void {
  describe(`kv backend contract: ${label}`, () => {
    it("opens a missing unit as empty and serves loadAll immediately", async () => {
      const { backend } = await create();
      const unit = await backend.kv!.open(DESCRIPTOR);
      const snapshot = await unit.loadAll();
      assert.deepEqual(plain(snapshot.tables), { alpha: {}, beta: {} });
      assert.equal(snapshot.global, null);
      await backend.close();
    });

    it("round-trips records and global durably across reopen", async () => {
      const harness = await create();
      const unit = await harness.backend.kv!.open(DESCRIPTOR);
      await unit.putRecord("alpha", "k1", { n: 1 });
      await unit.putRecord("alpha", "k2", { n: 2 });
      await unit.putRecord("beta", "weird key / with:stuff", { ok: true });
      await unit.setGlobal({ counter: 7 });
      await harness.backend.close();

      const reopened = await harness.reopen();
      const unit2 = await reopened.kv!.open(DESCRIPTOR);
      const snapshot = await unit2.loadAll();
      assert.deepEqual(plain(snapshot.tables["alpha"]), {
        k1: { n: 1 },
        k2: { n: 2 },
      });
      assert.deepEqual(plain(snapshot.tables["beta"]), {
        "weird key / with:stuff": { ok: true },
      });
      assert.deepEqual(snapshot.global, { counter: 7 });
      await reopened.close();
    });

    it("putRecord overwrites and deleteRecord is idempotent", async () => {
      const { backend } = await create();
      const unit = await backend.kv!.open(DESCRIPTOR);
      await unit.putRecord("alpha", "k", { v: "old" });
      await unit.putRecord("alpha", "k", { v: "new" });
      await unit.deleteRecord("alpha", "k");
      await unit.deleteRecord("alpha", "k");
      await unit.deleteRecord("alpha", "never-existed");
      const snapshot = await unit.loadAll();
      assert.deepEqual(plain(snapshot.tables["alpha"]), {});
      await backend.close();
    });

    it("rejects a version mismatch on reopen without touching the data", async () => {
      const harness = await create();
      const unit = await harness.backend.kv!.open(DESCRIPTOR);
      await unit.putRecord("alpha", "k", { v: 1 });
      await harness.backend.close();

      const reopened = await harness.reopen();
      await assert.rejects(reopened.kv!.open({ ...DESCRIPTOR, version: 4 }), {
        name: "StorageError",
        code: "version-mismatch",
      });
      // Original version still opens and still holds the data.
      const unit2 = await reopened.kv!.open(DESCRIPTOR);
      assert.deepEqual(plain((await unit2.loadAll()).tables["alpha"]), {
        k: { v: 1 },
      });
      await reopened.close();
    });

    it("rejects operations after unit close, and close is idempotent", async () => {
      const { backend } = await create();
      const unit = await backend.kv!.open(DESCRIPTOR);
      await unit.close();
      await unit.close();
      await assert.rejects(unit.putRecord("alpha", "k", {}), { code: "closed" });
      await assert.rejects(unit.loadAll(), { code: "closed" });
      await backend.close();
      await backend.close();
    });
  });
}
