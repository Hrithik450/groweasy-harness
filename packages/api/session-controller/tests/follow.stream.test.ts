import test from "node:test";
import assert from "node:assert/strict";

import { SessionSeq } from "@openai-harness/session";
import type { SessionEvent } from "@openai-harness/session";
import type { SessionAssistantStreamFrame } from "@openai-harness/sdk-protocol";
import { openSessionFollow } from "../src/follow.stream";
import type { SessionFollowService } from "../src/types";

function event(seq: number): SessionEvent {
  return {
    type: "user/message",
    seq: SessionSeq(seq),
    time: 0,
    data: {
      id: `m${seq}`,
      role: "user",
      content: [{ type: "text", text: `m${seq}` }],
    },
  } as SessionEvent;
}

interface Harness {
  readonly source: SessionFollowService;
  emit(events: readonly SessionEvent[]): void;
  emitFrame(frame: SessionAssistantStreamFrame): void;
  readonly stopped: { events: number; frames: number };
}

function harness(initial: readonly SessionEvent[] = []): Harness {
  const eventListeners = new Set<
    (sessionId: string, events: readonly SessionEvent[]) => void
  >();
  const frameListeners = new Set<
    (sessionId: string, frame: SessionAssistantStreamFrame) => void
  >();
  const stopped = { events: 0, frames: 0 };
  return {
    source: {
      getSession: () => Promise.resolve({ success: true, data: { id: "s1" } }),
      getEvents: () => Promise.resolve(initial),
      onEvents: (listener) => {
        eventListeners.add(listener);
        return () => {
          stopped.events += 1;
          eventListeners.delete(listener);
        };
      },
      onAssistantFrames: (listener) => {
        frameListeners.add(listener);
        return () => {
          stopped.frames += 1;
          frameListeners.delete(listener);
        };
      },
      getBaseline: () => undefined,
    },
    emit: (events) => {
      for (const listener of eventListeners) listener("s1", events);
    },
    emitFrame: (frame) => {
      for (const listener of frameListeners) listener("s1", frame);
    },
    stopped,
  };
}

test("the snapshot is emitted before buffered live events, without duplicates", async () => {
  const h = harness();
  // Replace getEvents with a controlled promise.
  let release!: (events: readonly SessionEvent[]) => void;
  const eventsReady = new Promise<readonly SessionEvent[]>((resolve) => {
    release = resolve;
  });
  const source: SessionFollowService = { ...h.source, getEvents: () => eventsReady };
  const abort = new AbortController();
  const stream = openSessionFollow({
    userId: "u1",
    args: { sessionId: "s1" },
    signal: abort.signal,
    source,
  });
  const iterator = stream[Symbol.asyncIterator]();
  const pending = iterator.next();
  await new Promise((resolve) => setTimeout(resolve, 0));

  // While the durable read is pending, the live path buffers.
  h.emit([event(1)]);
  h.emit([event(2)]);
  release([event(1)]);

  const snapshot = await pending;
  assert.deepEqual(snapshot.value, {
    type: "snapshot",
    cursor: 1,
    records: [{ type: "event", event: event(1) }],
    hasMore: false,
  });

  // Event 1 arrived live and durably; only event 2 is new.
  const live = await iterator.next();
  assert.deepEqual(live.value, { type: "event", event: event(2) });

  h.emit([event(3)]);
  const later = await iterator.next();
  assert.deepEqual(later.value, { type: "event", event: event(3) });

  abort.abort();
  assert.deepEqual(await iterator.next(), { value: undefined, done: true });
  assert.equal(h.stopped.events, 1);
  assert.equal(h.stopped.frames, 1);
});

test("afterSeq bounds the snapshot at the acknowledged sequence", async () => {
  const h = harness([event(1), event(2), event(3)]);
  const source: SessionFollowService = {
    ...h.source,
    getEvents: () => Promise.resolve([event(1), event(2), event(3)]),
  };
  const abort = new AbortController();
  const stream = openSessionFollow({
    userId: "u1",
    args: { sessionId: "s1", afterSeq: 1, maxMessages: 1 },
    signal: abort.signal,
    source,
  });
  const iterator = stream[Symbol.asyncIterator]();
  const snapshot = await iterator.next();
  assert.deepEqual(snapshot.value, {
    type: "snapshot",
    cursor: 1,
    records: [{ type: "event", event: event(1) }],
    hasMore: false,
  });

  h.emit([event(2), event(3)]);
  assert.deepEqual((await iterator.next()).value, {
    type: "event",
    event: event(2),
  });
  assert.deepEqual((await iterator.next()).value, {
    type: "event",
    event: event(3),
  });
  abort.abort();
  await iterator.next();
});

test("assistant frames buffer before the snapshot and stream after it", async () => {
  const h = harness();
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const source: SessionFollowService = {
    ...h.source,
    getEvents: async () => {
      await ready;
      return [];
    },
  };
  const abort = new AbortController();
  const iterator = openSessionFollow({
    userId: "u1",
    args: { sessionId: "s1" },
    signal: abort.signal,
    source,
  })[Symbol.asyncIterator]();
  const pending = iterator.next();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const frame: SessionAssistantStreamFrame = {
    type: "start",
    attemptId: "a1",
    revision: 1,
    turn: 1,
    step: 1,
    startedAfterSeq: 0,
  };
  h.emitFrame(frame);
  release();

  const snapshot = await pending;
  assert.deepEqual(snapshot.value, {
    type: "snapshot",
    cursor: -1,
    records: [],
    hasMore: false,
  });
  assert.deepEqual((await iterator.next()).value, {
    type: "assistant-stream",
    frame,
  });

  abort.abort();
  await iterator.next();
});

test("an unowned session rejects before any listener is attached", async () => {
  const h = harness();
  const abort = new AbortController();
  await assert.rejects(
    async () => {
      for await (const _frame of openSessionFollow({
        userId: "u1",
        args: { sessionId: "other" },
        signal: abort.signal,
        source: {
          ...h.source,
          getSession: () => Promise.resolve({ success: true, data: { id: "s1" } }),
        },
      })) {
        // no frames
      }
    },
    /Session not found/,
  );
});

test("invalid args reject with the contract message", async () => {
  const h = harness();
  const abort = new AbortController();
  await assert.rejects(
    async () => {
      for await (const _frame of openSessionFollow({
        userId: "u1",
        args: { sessionId: "" },
        signal: abort.signal,
        source: h.source,
      })) {
        // no frames
      }
    },
    /sessionId|too small|Invalid subscription params/i,
  );
});
