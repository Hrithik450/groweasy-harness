# @openai-harness/storage

Storage hub (`ctx.storage`): a named backend registry plus mounted data-form
facilities. The hub performs no IO — backends own a medium, and data forms own
the semantics layered over them.

What it owns:
- `Storage`, the Cordis service mounted as `ctx.storage`;
- `BackendRegistry`, the name → `StorageBackend` table, with registration
  disposers that remove only their own contribution;
- `StorageForms`, the declaration-merging seam data-form packages extend before
  calling `ctx.storage.mount(form, facility)`;
- `storageBackendServiceKey(name)` (`storage.backend.<name>`), the lifecycle
  key backend plugins provide so form owners can inject pending backends;
- the backend contract in `src/backend.ts` — `KvFacet`, `KvUnit`,
  `KvUnitDescriptor`, and `UNIT_NAME_RE` — plus the `StorageError` codes shared
  by the hub and every backend.

What it does not own:
- a medium: opening files, connections, and pragmas belongs to a backend
  package such as `@openai-harness/storage-sqlite`;
- schema validation, change events, or typed records: those belong to a data
  form such as the reference repository's `storage-domain`;
- which backend serves which consumer: that is the consumer's route
  configuration, never a hub-global choice.

Usage:

```ts
const ctx = new Context();
await ctx.plugin(Storage);

const dispose = ctx.storage.backend.register("sqlite", backend);
const sqlite = ctx.storage.backend.get("sqlite");
// dispose() unregisters; the owning plugin still closes the backend.
```

Source reference: `packages/storage/storage` in the reference
deepseek-harness repository, kept in its plugin/service shape.
