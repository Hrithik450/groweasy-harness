import test from "node:test";
import assert from "node:assert/strict";

import { SessionSeq, type SessionEvent } from "@openai-harness/session";
import type { DetailBarState } from "@openai-harness/session-projection";
import {
  advanceProjectionSnapshot,
  applyProjectionSnapshot,
  ensureSessionProjectionSeed,
  projectionCacheKey,
  resetProjectionCache,
  useProjectionStore,
} from "../src/store/projection.store";

function detailBarEvent(seq: number, data: DetailBarState): SessionEvent {
  return {
    type: "detailBar/update",
    seq: SessionSeq(seq),
    time: 0,
    data: { detailBar: data },
  } as SessionEvent;
}

function turnStart(seq: number): SessionEvent {
  return {
    type: "turn/start",
    seq: SessionSeq(seq),
    time: 0,
    data: { turn: 1 },
  } as SessionEvent;
}

function snapshot(state: DetailBarState, asOfSeq: number) {
  return {
    key: "detailBar",
    asOfSeq,
    stateVersion: 1,
    state,
  };
}

test("applyProjectionSnapshot caches a whole projection value", () => {
  resetProjectionCache();

  const entry = applyProjectionSnapshot(
    "s1",
    "detailBar",
    snapshot({ type: "adManager", data: { campaigns: [] } }, 4),
  );

  assert.equal(entry.hasSnapshot, true);
  assert.equal(entry.loading, false);
  assert.equal(entry.asOfSeq, 4);
  assert.deepEqual(entry.state, { type: "adManager", data: { campaigns: [] } });
  assert.deepEqual(
    useProjectionStore.getState().entries[
      projectionCacheKey("s1", "detailBar")
    ],
    entry,
  );
});

test("advanceProjectionSnapshot folds only events newer than asOfSeq", () => {
  const base = snapshot({ type: "default", data: { notes: "seed" } }, 2);

  const advanced = advanceProjectionSnapshot(
    base,
    [
      // Re-delivery of the snapshot's own cut is ignored.
      detailBarEvent(2, { type: "default", data: { notes: "stale" } }),
      turnStart(3),
      detailBarEvent(4, { type: "default", data: { notes: "streamed" } }),
    ],
    "detailBar",
  );

  assert.deepEqual(advanced.state, {
    type: "default",
    data: { notes: "streamed" },
  });
  assert.equal(advanced.asOfSeq, 4);
});

test("advanceProjectionSnapshot returns the input when nothing is newer", () => {
  const base = snapshot({ type: "default", data: {} }, 5);
  const advanced = advanceProjectionSnapshot(
    base,
    [detailBarEvent(5, { type: "adManager", data: {} })],
    "detailBar",
  );
  assert.equal(advanced, base);
});

test("an irrelevant newer event advances the log cut without changing state", () => {
  const base = snapshot({ type: "default", data: { notes: "seed" } }, 1);
  const advanced = advanceProjectionSnapshot(base, [turnStart(2)], "detailBar");

  assert.equal(advanced.state, base.state);
  assert.equal(advanced.asOfSeq, 2);
});

test("concurrent seeds share one session.projection request", async () => {
  resetProjectionCache();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return snapshot({ type: "default", data: { notes: "seed" } }, 2);
  };

  await Promise.all([
    ensureSessionProjectionSeed("s1", "detailBar", fetcher),
    ensureSessionProjectionSeed("s1", "detailBar", fetcher),
  ]);

  assert.equal(calls, 1);
  const entry =
    useProjectionStore.getState().entries[
      projectionCacheKey("s1", "detailBar")
    ];
  assert.equal(entry?.hasSnapshot, true);
  assert.deepEqual(entry?.state, { type: "default", data: { notes: "seed" } });
});

test("a failed seed falls back to the empty state and the fold still drives it", async () => {
  resetProjectionCache();

  await ensureSessionProjectionSeed("s2", "detailBar", async () => {
    throw new Error("projection endpoint unavailable");
  });

  const entry =
    useProjectionStore.getState().entries[
      projectionCacheKey("s2", "detailBar")
    ];
  assert.equal(entry?.hasSnapshot, true);
  assert.equal(entry?.loading, false);
  assert.ok(entry?.error instanceof Error);
  assert.deepEqual(entry?.state, { type: "default", data: {} });

  const advanced = advanceProjectionSnapshot(
    entry!,
    [detailBarEvent(1, { type: "adStrategist", data: { reports: [] } })],
    "detailBar",
  );
  assert.deepEqual(advanced.state, {
    type: "adStrategist",
    data: { reports: [] },
  });
  assert.equal(advanced.asOfSeq, 1);
});
