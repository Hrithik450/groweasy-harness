# @openai-harness/storage-json

JSON file backend for the storage hub: one human-readable document per unit
under a configured root, published by atomic rewrite. Registers as backend
`json` on `ctx.storage`.

Two layouts share the root:
- `single` (the default) keeps the whole unit in `<root>/<name>.json` —
  pretty-printed, stable key order, `null` for a never-written global;
- `per-record` keeps one version-stamped document per record under
  `<root>/<name>/<table>/<key>.json` plus `global.json`, so a write rewrites
  one record instead of the whole unit. A malformed or stale record document
  reads as absent instead of bricking the unit; keys must be path-safe
  (`[a-zA-Z0-9_-]+`). An empty per-record tree bootstraps once from a legacy
  whole-unit file whose stored version is accepted, leaving that file intact.

What it owns:
- the `kv` facet from `@openai-harness/storage`: versioned units with
  per-record durable puts/deletes, an optional global singleton, and
  per-record backups (`backupRecord`) in the `per-record` layout;
- atomic replacement: write a same-directory temp file, fsync it, rename over
  the target, then fsync the parent directory on POSIX;
- the `json` registration and `storage.backend.json` lifecycle service.

What it does not own:
- write ordering — per the backend contract, the caller (the domain layer's
  write chain) serializes writes;
- a default root: `root` is required, so unit files never appear wherever the
  process happens to start.

```ts
const ctx = new Context();
await ctx.plugin(Storage);
const fiber = await ctx.plugin(StorageJson, { root: "data/storage" });
```

Source reference: `packages/storage/storage-json` in the reference
deepseek-harness repository, kept in its plugin/backend shape.
