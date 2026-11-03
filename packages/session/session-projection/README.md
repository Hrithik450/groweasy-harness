# @openai-harness/session-projection

Pure, client-safe read/derive layer for a session's committed event log. The
package turns event windows into surface items, turns, model-visible chat
messages, tool timelines, live overlays, projection values, and a wire-safe
session view. It never reads a database and never imports `@/lib`.

## Boundaries

Owned here:

- `foldSurface` / `classifyUserSource` — the ordered conversation surface.
- `foldEventsToTurns` / `foldSurfaceToTurns` / `summarizeProcess` — the turn
  projection, process folds, and their disclosure summaries.
- `toChatMessages` — the model-visible transcript, including compaction
  checkpoints and pruned tool results.
- `deriveToolTimeline` — call/result pairing for the activity feed.
- `pendingPrompts` / `withOptimisticPrompts` / `withAssistantStream` — the two
  things that are not durable yet while a turn runs.
- `SessionProjectionRegistry` and `ProjectionDefinition` — pure folds over
  committed events, optionally seeded by a host-persisted checkpoint.
- `assembleSessionView` / `foldSessionViewEvents` — client-safe assembly of the
  wire `SessionView` plus rendered turns, with no storage row involved.
- `SessionEventBusPort` / `AssistantStreamBusPort` — the subscribe/emit seam a
  host binds to its own process-local buses.

Deliberately host-side:

- the concrete event bus and assistant-stream bus (globalThis live state,
  Next dev reload survival, wire-frame mapping);
- the session controller and follow transport;
- the persistence repositories and their Drizzle bindings;
- the agent/follow Cordis service adapters.

## Usage

```ts
import {
  assembleSessionView,
  SessionProjectionRegistry,
} from "@openai-harness/session-projection";

const { session, turns } = assembleSessionView(
  wireSession,
  journal.window.events,
  { prompts: submitted, assistantStream: journal.assistantStream },
);

const registry = new SessionProjectionRegistry();
registry.register({
  key: "detailBar",
  stateVersion: 1,
  init: () => ({ type: "default", data: {} }),
  apply: (state, event) =>
    event.type === "detailBar/update"
      ? (event.data.detailBar as typeof state)
      : state,
});
```

`assembleSessionView` returns a new `SessionView`; the caller's object is not
mutated. Live overlays are optional and are applied only on top of the durable
projection.

## Tests

```sh
node --import tsx --test "packages/session/session-projection/tests/*.test.ts"
```

Tests import `../src/...` directly and use only the shared packages, so they
run without the Next application.
