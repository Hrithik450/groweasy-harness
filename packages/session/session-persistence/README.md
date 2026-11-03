# @openai-harness/session-persistence

Append-only session event ledger: `SessionEventsRepository` writes contiguous
`(session_id, seq)` batches in one transaction, advances the parent session's
`updated_at`, and announces the committed batch only after commit.
`assertContiguous` and `assertVersion` fail closed on gaps and stale format
versions.

Storage is host-owned. The repository takes a `SessionEventsStore` — the
host's Drizzle client, its `session_events` and `sessions` tables, a
primary-key minter, and optional post-commit publisher — so this package does
not import the application's database module, its aliases, or Next.js. A host
that composes the ledger once can bind that store with
`configureSessionEventsStore()` and then construct `SessionEventsRepository`
without arguments; the application's `src/lib/session/persistence/events.repo.ts`
shim does exactly that and keeps the existing import paths resolving.

Source reference: the append path of the reference deepseek-harness
`session-persistence` seam, kept in its repository-and-contract shape rather
than re-shaped into the reference's handle-based service.
