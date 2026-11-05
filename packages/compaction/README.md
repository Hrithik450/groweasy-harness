# Compaction packages

Condense older conversation history into one durable checkpoint message while
keeping the recent tail verbatim. The shadowed events stay in the append-only
log, so replay deterministically reproduces the condensed conversation.

- `compaction/` — the backend-independent seam: abstract `ctx.compaction`
  service, checkpoint source marker, result vocabulary, and tool-pairing cut
  arithmetic. It performs no condensation itself.
- `compaction-basic/` — the shipped backend: threshold policy, deterministic
  tool-result pruning, projection-aware range selection, and model-driver
  summarization.

The application's `src/lib/core/compaction/*` files re-export these packages so
existing importers keep compiling unchanged; the only application logic left is
the host binder for environment lookup and session derivation.

Deferred from the reference layout: `compaction-tool-result-pruner` and
`compaction-image-offload` as standalone packages. The pruner currently ships
inside `compaction-basic`; image offload has no implementation in this
repository yet.
