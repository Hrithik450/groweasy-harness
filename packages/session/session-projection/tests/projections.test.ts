import test from "node:test";
import assert from "node:assert/strict";

import type { SessionEvent, SessionHeader } from "@openai-harness/session";
import { SessionId, SessionSeq } from "@openai-harness/session";
import { SessionProjectionRegistry } from "../src/projections/registry";

const header: SessionHeader = {
  version: 1,
  id: SessionId("session-1"),
  createdAt: 0,
};

function detailBarEvent(seq: number, detailBar: unknown): SessionEvent {
  return {
    type: "detailBar/update",
    seq: SessionSeq(seq),
    time: 1_000 + seq,
    data: { detailBar },
  };
}

function registry(): SessionProjectionRegistry {
  const projections = new SessionProjectionRegistry();
  projections.register({
    key: "detailBar",
    stateVersion: 2,
    init: () => ({ type: "default", data: {} }),
    apply: (state, event) =>
      event.type === "detailBar/update"
        ? {
            type:
              typeof event.data.detailBar === "object" &&
              event.data.detailBar !== null &&
              "type" in event.data.detailBar
                ? String(
                    (event.data.detailBar as { type: unknown }).type,
                  )
                : "default",
            data: event.data.detailBar,
          }
        : state,
  });
  return projections;
}

test("compute folds every relevant event and reports the watermark", () => {
  const projections = registry();
  const snapshot = projections.compute(
    "detailBar",
    header,
    [detailBarEvent(0, { type: "adManager", data: { n: 1 } })],
  );

  assert.equal(snapshot.key, "detailBar");
  assert.equal(snapshot.asOfSeq, 0);
  assert.equal(snapshot.stateVersion, 2);
  assert.deepEqual(snapshot.state, {
    type: "adManager",
    data: { type: "adManager", data: { n: 1 } },
  });
});

test("a matching checkpoint skips folded events and folds the suffix", () => {
  const projections = registry();
  const snapshot = projections.compute(
    "detailBar",
    header,
    [
      detailBarEvent(0, { type: "first", data: {} }),
      detailBarEvent(1, { type: "second", data: {} }),
    ],
    {
      stateVersion: 2,
      asOfSeq: 0,
      state: { type: "checkpoint", data: {} },
    },
  );

  assert.equal(snapshot.asOfSeq, 1);
  assert.deepEqual(snapshot.state, {
    type: "second",
    data: { type: "second", data: {} },
  });
});

test("a stale checkpoint restarts from init over the whole log", () => {
  const projections = registry();
  const snapshot = projections.compute(
    "detailBar",
    header,
    [detailBarEvent(0, { type: "fresh", data: {} })],
    {
      stateVersion: 1,
      asOfSeq: 0,
      state: { type: "stale", data: {} },
    },
  );

  assert.equal(snapshot.asOfSeq, 0);
  assert.deepEqual(snapshot.state, {
    type: "fresh",
    data: { type: "fresh", data: {} },
  });
});

test("unregistered keys fail explicitly", () => {
  const projections = new SessionProjectionRegistry();
  assert.throws(
    () => projections.compute("detailBar", header, []),
    /No projection definition registered/,
  );
});
