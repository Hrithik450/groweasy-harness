# @openai-harness/storage-domain

Domain data form (`ctx.storage.domain`): schema-validated, change-emitting
key-value domains over storage backends. Declare a domain once with
`defineDomain`; consumers open it through `ctx.storageDomain` and get
synchronous reads from validated in-memory state plus durable writes that emit
`domain/changed` in order.

What it owns:
- `defineDomain`, `domainTable`, and `descriptorOf` — the declaration
  vocabulary and its projection onto the backend unit descriptor;
- `DomainFacility`, mounted as the `domain` form on the storage hub, with
  per-domain backend routing (`backend` default plus `routes` overrides);
- one write chain per open domain: backend durability first, then memory
  mutation, then the change event, so a rejected write leaves memory
  untouched;
- `DomainError` codes `already-open`, `facet-unsupported`, `invalid-record`,
  `missing-key`, and `closed`. Backend failures such as `version-mismatch`
  pass through as `StorageError`.

Record schemas are zod (`z.infer` keeps consumer types un-duplicated); the
plugin `Config` stays schemastery. A domain or table name outside
`UNIT_NAME_RE`, a version that is not a non-negative integer, or a global
schema that accepts `null` fails loud at module load.

What it does not own:
- the medium, its connection, or its file layout — that belongs to a backend
  package such as `@openai-harness/storage-sqlite` or
  `@openai-harness/storage-json`;
- cross-process change visibility: `domain/changed` is an in-process event.

Usage:

```ts
const spec = defineDomain({
  name: "workspace",
  version: 1,
  tables: { workspaces: domainTable(workspaceSchema) },
});

const domain = await ctx.storageDomain.open(spec);
await domain.table("workspaces").put(id, { path: "/work/demo" });
const record = domain.table("workspaces").get(id); // synchronous, from memory
await domain.close(); // drains queued writes and frees the name
```

The caller owns the returned handle and closes it (typically as its own
`ctx.effect` disposer); domains still open when the plugin unmounts are
closed by the facility.

Source reference: `packages/storage/storage-domain` in the reference
deepseek-harness repository, kept in its plugin/service shape.
