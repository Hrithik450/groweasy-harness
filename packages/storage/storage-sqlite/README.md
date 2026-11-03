# @openai-harness/storage-sqlite

SQLite backend for the storage hub: one database file hosts every routed
unit, document-per-row (`key TEXT` / `value TEXT` JSON). Registers as backend
`sqlite` on `ctx.storage`.

What it owns:
- the `kv` facet from `@openai-harness/storage`: versioned units with
  per-record durable puts/deletes and an optional global singleton;
- its own `node:sqlite` `DatabaseSync` connection, opened from the configured
  `{ path }` (or `:memory:`), with missing directories and database files
  created owner-only and existing path modes preserved;
- the pragmas: `foreign_keys = ON`, the configured `journal_mode` (`wal` by
  default), and the database-wide `PRAGMA user_version` schema stamp;
- the `units` and `unit_globals` metadata tables, plus one
  `u_<unit>_<table>` record table per declared descriptor table.

The physical layout version lives in `PRAGMA user_version` and is exposed as
`STORAGE_SQLITE_SCHEMA_VERSION`. A stamped version other than the current one
rejects with `version-mismatch`; a fresh database is stamped only after its
tables are created, so an interrupted materialization stays unstamped and
retries on the next open. Unit versions are checked separately in `units`.

The Cordis entry point is `apply(ctx, config)`, which opens the database,
registers the backend as `sqlite`, and provides `storage.backend.sqlite`. The
disposer unregisters the name first, then closes the medium.

```ts
const ctx = new Context();
await ctx.plugin(Storage);
const fiber = await ctx.plugin(StorageSqlite, { path: "data/storage.db" });
```

Source reference: `packages/storage/storage-sqlite` in the reference
deepseek-harness repository, kept in its own-connection shape.
