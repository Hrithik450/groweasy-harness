import test from "node:test";
import assert from "node:assert/strict";

import type { CredentialStore } from "../src/store";
import type {
  CredentialKey,
  CredentialRecord,
  CredentialRecordEntry,
} from "../src/types";
import { CredentialRecords } from "../src/records";
import { credentialKey } from "../src/keys";

/** In-memory store double: the service only needs the four primitives. */
class MemoryStore implements CredentialStore {
  readonly writable = true;
  private readonly records = new Map<CredentialKey, CredentialRecord>();

  async read(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return this.records.get(key);
  }

  async write(key: CredentialKey, record: CredentialRecord): Promise<void> {
    this.records.set(key, record);
  }

  async delete(key: CredentialKey): Promise<void> {
    this.records.delete(key);
  }

  async list(): Promise<readonly CredentialRecordEntry[]> {
    return [...this.records].map(([key, record]) => ({
      key,
      kind: record.kind,
    }));
  }
}

const key = credentialKey("connectors", "meta-ads");

test("a written record reads back and describes without its value", async () => {
  const records = new CredentialRecords(new MemoryStore());
  const stored: CredentialRecord = { kind: "api-key", key: "secret-value" };

  await records.modifyRecord(key, async () => stored);

  assert.deepEqual(await records.readRecord(key), stored);
  assert.deepEqual(await records.describeRecord(key), {
    configured: true,
    kind: "api-key",
    writable: true,
  });
  assert.deepEqual(await records.listRecords(), [
    { key, kind: "api-key" },
  ]);
});

test("an absent record describes as unconfigured", async () => {
  const records = new CredentialRecords(new MemoryStore());

  assert.deepEqual(await records.describeRecord(key), {
    configured: false,
    kind: undefined,
    writable: true,
  });
});

test("a mutation returning undefined leaves the record untouched", async () => {
  const records = new CredentialRecords(new MemoryStore());
  const stored: CredentialRecord = { kind: "grant", payload: { token: "a" } };
  await records.modifyRecord(key, async () => stored);

  const result = await records.modifyRecord(key, async () => undefined);

  assert.deepEqual(result, stored);
  assert.deepEqual(await records.readRecord(key), stored);
});

test("concurrent mutations of one key see each other's writes", async () => {
  const records = new CredentialRecords(new MemoryStore());
  await records.modifyRecord(key, async () => ({
    kind: "grant",
    payload: { n: 0 },
  }));

  const observations: unknown[] = [];
  const first = records.modifyRecord(key, async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { kind: "grant", payload: { n: 1 } };
  });
  const second = records.modifyRecord(key, async (current) => {
    observations.push(current);
    return { kind: "grant", payload: { n: 2 } };
  });

  await Promise.all([first, second]);

  assert.deepEqual(observations[0], { kind: "grant", payload: { n: 1 } });
  assert.deepEqual(await records.readRecord(key), {
    kind: "grant",
    payload: { n: 2 },
  });
});

test("deleting a record removes it and deleting again is a no-op", async () => {
  const records = new CredentialRecords(new MemoryStore());
  await records.modifyRecord(key, async () => ({ kind: "api-key", key: "x" }));

  await records.deleteRecord(key);
  await records.deleteRecord(key);

  assert.equal(await records.readRecord(key), undefined);
  assert.deepEqual(await records.listRecords(), []);
});

test("a read-only store reports records as unwritable", async () => {
  const readOnly: CredentialStore = {
    read: async () => undefined,
    write: async () => undefined,
    delete: async () => undefined,
    list: async () => [],
    writable: false,
  };

  assert.deepEqual(
    await new CredentialRecords(readOnly).describeRecord(key),
    { configured: false, kind: undefined, writable: false },
  );
});
