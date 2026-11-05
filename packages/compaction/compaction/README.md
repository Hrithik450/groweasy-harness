# @openai-harness/compaction

The backend-independent compaction seam: an abstract `ctx.compaction` service,
the checkpoint source marker every backend writes, and the tool-pairing cut
arithmetic that keeps a summarized range from splitting a tool call from its
result.

What it owns:
- `CompactionEngine`, the abstract Cordis service mounted as `ctx.compaction`,
  with `compactIfNeeded`, `compactNow`, `compactRegion`, and the application's
  `maybeCompact` compatibility entry point;
- `CompactionResult`, the compacted range, summary identity, token price, and
  trigger reported by every backend;
- `CompactionSession`, the structural session capability the engine mutates —
  `events`, `append`, and `userId` — so the package imports no application
  `Session` class or persistence repository;
- `CompactCheckpointSource` plus `compactCheckpointSource` and
  `isCompactCheckpointSource`, the backend-independent marker carried by the
  replacement `user/message`;
- `CompactionId`, the branded transaction identity shared by the checkpoint
  marker and its message;
- `toolPairingBalances`, `toolPairingBalancedBefore`, and
  `toolPairingBalancedAfter`, the cut arithmetic over ordered model-visible
  entries.

What it does not own:
- trigger policy, retention, pruning, range selection, or summarization —
  those belong to `@openai-harness/compaction-basic` or another backend;
- the session log, projection, and derivation — the application supplies a
  `CompactionSession` and its own message derivation;
- persistence and database access.

## Implementing a backend

Extend `CompactionEngine` and implement the three abstract operations. The
service registers itself as `compaction` for the owning context:

```ts
import { Context } from "@deepseek-ai/cordis";
import { CompactionEngine } from "@openai-harness/compaction";

class MyBackend extends CompactionEngine {
  async compactIfNeeded(session, driver, signal) { /* ... */ }
  async compactNow(session, driver, signal) { /* ... */ }
  async compactRegion(start, end, session, driver, signal) { /* ... */ }
}

const ctx = new Context();
await ctx.plugin(MyBackend);
```

Every replacement message must use `compactCheckpointSource(compactionId)` so
consumers recognize condensed history independently of the backend.

## Tool-pairing boundaries

The application surface is the ordered projection of the durable log, not a
rewritable object. Callers therefore compute `toolPairingBalances(entries)` once
and answer both edge checks from that array. A cut is balanced when no
unanswered assistant tool call crosses it; an orphan tool result rejects as
corrupt surface state.

## Source map

| File | Role |
|---|---|
| `src/index.ts` | Abstract `CompactionEngine`, `ctx.compaction` merge |
| `src/types.ts` | `CompactionResult`, `CompactionSession`, event payload re-exports |
| `src/checkpoint.ts` | Checkpoint source constructor and predicate |
| `src/tool-pairing.ts` | Cut-balance arithmetic over model-visible entries |
| `src/brand.ts` | `CompactionId` branded identity |
