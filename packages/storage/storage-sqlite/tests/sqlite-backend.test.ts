import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import Storage, {
  storageBackendServiceKey,
  type KvUnitDescriptor,
} from "@openai-harness/storage";

import { runKvBackendContract } from "../../storage/tests/contract";
import * as StorageSqlite from "../src/index";
import {
  SqliteStorageBackend,
  STORAGE_SQLITE_SCHEMA_VERSION,
} from "../src/index";

/** Resolve the config defaults the loader would apply. */
function backendAt(path: string): SqliteStorageBackend {
  return new SqliteStorageBackend({ path, journalMode: "wal" });
}

/**
 * Normalize a record map for prototype-insensitive comparison: SQLite units
 * build their table maps with a null prototype, which `deepStrictEqual`
 * distinguishes from `{}`.
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function freshDbPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "openai-harness-storage-sqlite-"));
  dirs.push(dir);
  return join(dir, "storage.db");
}

// The contract suite's reopen() needs a surviving medium, so the harness binds
// a real file; :memory: gets its own cases below.
runKvBackendContract("sqlite", async () => {
  const path = await freshDbPath();
  return {
    backend: backendAt(path),
    reopen: async () => backendAt(path),
  };
});

const DESCRIPTOR: KvUnitDescriptor = {
  name: "specimen",
  version: 1,
  tables: ["records"],
  hasGlobal: true,
};

describe("sqlite backend specifics", () => {
  it("opens an in-memory database", async () => {
    const backend = backendAt(":memory:");
    const unit = await backend.kv.open(DESCRIPTOR);
    await unit.putRecord("records", "k", { n: 1 });
    assert.deepEqual(plain((await unit.loadAll()).tables["records"]), { k: { n: 1 } });
    await backend.close();
  });

  it("materializes STRICT record tables and stamps the schema version", async () => {
    const path = await freshDbPath();
    const backend = backendAt(path);
    const unit = await backend.kv.open(DESCRIPTOR);
    await unit.putRecord("records", "k", { n: 1 });
    await backend.close();

    const db = new DatabaseSync(path);
    try {
      const { user_version: version } = db
        .prepare("PRAGMA user_version")
        .get() as { user_version: number };
      assert.equal(version, STORAGE_SQLITE_SCHEMA_VERSION);
      const table = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'u_specimen_records'",
        )
        .get() as { sql: string } | undefined;
      assert.ok(table?.sql.includes("STRICT"));
      const unitRow = db
        .prepare("SELECT version FROM units WHERE name = ?")
        .get("specimen") as { version: number };
      assert.equal(unitRow.version, DESCRIPTOR.version);
    } finally {
      db.close();
    }
  });

  it("rejects a mismatched database schema version", async () => {
    const path = await freshDbPath();
    const db = new DatabaseSync(path);
    db.exec("PRAGMA user_version = 999");
    db.close();

    const backend = backendAt(path);
    await assert.rejects(backend.kv.open(DESCRIPTOR), {
      name: "StorageError",
      code: "version-mismatch",
    });
    await backend.close();
  });

  it("rejects invalid unit and table names before touching the medium", async () => {
    const backend = backendAt(":memory:");
    await assert.rejects(backend.kv.open({ ...DESCRIPTOR, name: "Bad-Name" }), /violates/);
    await assert.rejects(
      backend.kv.open({ ...DESCRIPTOR, tables: ["ok", "1bad"] }),
      /violates/,
    );
    await backend.close();
  });

  it("rejects a second open of the same unit name", async () => {
    const backend = backendAt(":memory:");
    await backend.kv.open(DESCRIPTOR);
    await assert.rejects(backend.kv.open(DESCRIPTOR), /already open/);
    await backend.close();
  });

  it("allows re-open after unit close, and rejects open on a closed backend", async () => {
    const backend = backendAt(":memory:");
    const unit = await backend.kv.open(DESCRIPTOR);
    await unit.close();
    const again = await backend.kv.open(DESCRIPTOR);
    await again.putRecord("records", "k", 1);
    await backend.close();
    await assert.rejects(backend.kv.open(DESCRIPTOR), { code: "closed" });
  });

  it("round-trips prototype-polluting keys as own properties", async () => {
    const backend = backendAt(":memory:");
    const unit = await backend.kv.open(DESCRIPTOR);
    await unit.putRecord("records", "__proto__", { evil: true });
    await unit.putRecord("records", "constructor", { n: 1 });
    const { tables } = await unit.loadAll();
    const records = tables["records"]!;
    assert.equal(Object.hasOwn(records, "__proto__"), true);
    assert.deepEqual(records["__proto__"], { evil: true });
    assert.deepEqual(records["constructor"], { n: 1 });
    assert.equal(Object.hasOwn(Object.prototype, "evil"), false);
    await backend.close();
  });

  // Repeated durable DDL across four connections needs an instrumented I/O budget.
  it(
    "leaves a failed materialization unstamped so a repaired medium reopens",
    { timeout: 90_000 },
    async () => {
      const path = await freshDbPath();
      // Obstruct table creation: an index squatting on the unit_globals name
      // makes CREATE TABLE IF NOT EXISTS throw AFTER the units table exists.
      const setup = new DatabaseSync(path);
      try {
        setup.exec("CREATE TABLE squatter (x TEXT)");
        setup.exec("CREATE INDEX unit_globals ON squatter(x)");
      } finally {
        setup.close();
      }

      const broken = backendAt(path);
      try {
        await assert.rejects(broken.kv.open(DESCRIPTOR), /already an index/);
      } finally {
        await broken.close();
      }

      // Clear the obstruction; the medium must still be version 0, not a
      // half-materialized database stamped as current.
      const repair = new DatabaseSync(path);
      try {
        assert.equal(
          (repair.prepare("PRAGMA user_version").get() as { user_version: number })
            .user_version,
          0,
        );
        assert.equal(
          (
            repair
              .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'units'")
              .get() as { name: string }
          ).name,
          "units",
        );
        repair.exec("DROP INDEX unit_globals");
        assert.equal(
          repair
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'unit_globals'")
            .get(),
          undefined,
        );
      } finally {
        repair.close();
      }

      const backend = backendAt(path);
      try {
        const unit = await backend.kv.open(DESCRIPTOR);
        await unit.putRecord("records", "k", { n: 1 });
        assert.deepEqual(plain((await unit.loadAll()).tables["records"]), {
          k: { n: 1 },
        });
      } finally {
        await backend.close();
      }
    },
  );

  it("rejects unparsable stored JSON with malformed-medium", async () => {
    const path = await freshDbPath();
    const backend = backendAt(path);
    const unit = await backend.kv.open(DESCRIPTOR);
    await unit.putRecord("records", "good", { n: 1 });
    await unit.setGlobal({ g: 1 });
    await backend.close();

    const db = new DatabaseSync(path);
    db.prepare("UPDATE u_specimen_records SET value = ? WHERE key = ?").run(
      "{not json",
      "good",
    );
    db.close();

    const reopened = backendAt(path);
    const damaged = await reopened.kv.open(DESCRIPTOR);
    await assert.rejects(damaged.loadAll(), {
      name: "StorageError",
      code: "malformed-medium",
    });
    await reopened.close();
  });

  it("wraps a non-Error toJSON throw into an Error rejection", async () => {
    const backend = backendAt(":memory:");
    const unit = await backend.kv.open(DESCRIPTOR);
    // JSON.stringify propagates a value's own toJSON throw verbatim; the unit
    // must still reject with an Error instance.
    const hostile = {
      toJSON: () => {
        throw "not an error";
      },
    };
    await assert.rejects(unit.putRecord("records", "k", hostile), /not an error/);
    await assert.rejects(unit.putRecord("records", "k", hostile), Error);
    await backend.close();
  });

  it("rejects setGlobal on a unit without a global slot and writes to undeclared tables", async () => {
    const backend = backendAt(":memory:");
    const unit = await backend.kv.open({ ...DESCRIPTOR, hasGlobal: false });
    await assert.rejects(unit.setGlobal({ g: 1 }), /declared no global slot/);
    await assert.rejects(unit.putRecord("undeclared", "k", 1), /declared no table/);
    assert.equal((await unit.loadAll()).global, null);
    await backend.close();
  });

  it("drains a still-pending failed open during close", async () => {
    const path = await freshDbPath();
    const first = backendAt(path);
    await (await first.kv.open(DESCRIPTOR)).close();
    await first.close();

    const backend = backendAt(path);
    // Do not await: close() must tolerate an in-flight open that will reject
    // (version mismatch) while its name is still reserved in the unit table.
    const pending = backend.kv.open({ ...DESCRIPTOR, version: 99 });
    const closed = backend.close();
    await assert.rejects(pending, { code: "version-mismatch" });
    await closed;
  });

  it("propagates filesystem errors other than an existing database file", async () => {
    if (process.platform === "win32") return;
    const dir = await mkdtemp(join(tmpdir(), "openai-harness-storage-sqlite-"));
    dirs.push(dir);
    await chmod(dir, 0o500);
    const backend = backendAt(join(dir, "storage.db"));
    await assert.rejects(backend.kv.open(DESCRIPTOR), { code: "EACCES" });
    await backend.close();
    await chmod(dir, 0o700);
  });

  it("propagates an invalid database filename before opening SQLite", async () => {
    const path = await freshDbPath();
    const backend = backendAt(`${path}\0invalid`);
    await assert.rejects(backend.kv.open(DESCRIPTOR), /null bytes/i);
    await backend.close();
  });

  it("preserves the mode of an existing database file", async () => {
    if (process.platform === "win32") return;
    const path = await freshDbPath();
    await writeFile(path, "", { mode: 0o644 });
    await chmod(path, 0o644);
    const backend = backendAt(path);
    const unit = await backend.kv.open(DESCRIPTOR);
    await unit.putRecord("records", "k", 1);
    await backend.close();
  });

  it("registers on the storage hub as backend sqlite and closes on dispose", async () => {
    const ctx = new Context();
    await ctx.plugin(Storage);
    const fiber = await ctx.plugin(StorageSqlite, { path: ":memory:" });
    const backend = ctx.storage.backend.get("sqlite");
    assert.equal(ctx.get(storageBackendServiceKey("sqlite")), backend);
    const unit = await backend.kv!.open(DESCRIPTOR);
    await unit.putRecord("records", "k", { n: 1 });

    await fiber.dispose();
    assert.deepEqual(ctx.storage.backend.names(), []);
    assert.equal(ctx.get(storageBackendServiceKey("sqlite")), undefined);
    await assert.rejects(backend.kv!.open(DESCRIPTOR), { code: "closed" });
  });

  it("rejects an unparsable global slot with malformed-medium", async () => {
    const path = await freshDbPath();
    const backend = backendAt(path);
    const unit = await backend.kv.open(DESCRIPTOR);
    await unit.setGlobal({ g: 1 });
    await backend.close();

    const db = new DatabaseSync(path);
    db.prepare("UPDATE unit_globals SET value = ? WHERE unit = ?").run("][", "specimen");
    db.close();

    const reopened = backendAt(path);
    const damaged = await reopened.kv.open(DESCRIPTOR);
    await assert.rejects(damaged.loadAll(), {
      name: "StorageError",
      code: "malformed-medium",
    });
    await reopened.close();
  });
});
