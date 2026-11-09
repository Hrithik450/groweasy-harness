import test from "node:test";
import assert from "node:assert/strict";

import { SessionSeq } from "@openai-harness/session";
import type { SessionEvent } from "@openai-harness/session";
import type {
  SessionFollowFrame,
  SessionPage,
  SessionPageRequest,
} from "@openai-harness/sdk-protocol";
import {
  createRpcSessionTransport,
  type RpcSessionClient,
} from "../src/client/rpc.transport";
import type {
  SessionJournalDelivery,
  SessionJournalTransport,
} from "../src/client/session.controller";

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

class FakeRpc implements RpcSessionClient {
  subscribeParams: unknown;
  delivered: ((frame: SessionFollowFrame) => void) | undefined;
  closed = false;
  pageParams: SessionPageRequest | undefined;

  async subscribe(
    _channel: "session.follow",
    params: { sessionId: string; afterSeq?: number; maxMessages?: number },
    onEvent: (frame: SessionFollowFrame) => void,
  ) {
    this.subscribeParams = params;
    this.delivered = onEvent;
    return {
      subscriptionId: "sub",
      close: () => {
        this.closed = true;
      },
    };
  }

  async call(
    _method: "session.page",
    params: SessionPageRequest,
  ): Promise<SessionPage> {
    this.pageParams = params;
    return {
      records: [
        { type: "event", event: event(3) },
        { type: "event", event: event(4) },
      ],
      hasMore: true,
    };
  }
}

async function open(rpc: FakeRpc, transport: SessionJournalTransport) {
  const received: SessionJournalDelivery[] = [];
  const frames: unknown[] = [];

  const stop = transport.subscribe({
    sessionId: "s",
    afterSeq: 2,
    limit: 10,
    onDelivery: (delivery) => {
      received.push(delivery);
    },
    onAssistantFrame: (frame) => frames.push(frame),
  });
  // The fake registers its frame sink synchronously, but the transport
  // finishes its async handshake on a microtask. Flush before returning so
  // callers can emit frames with `rpc.delivered`.
  await Promise.resolve();
  await Promise.resolve();
  return { received, frames, stop };
}

test("subscribe opens session.follow with the resume cursor", async () => {
  const rpc = new FakeRpc();
  const transport = createRpcSessionTransport(rpc);
  const { received, stop } = await open(rpc, transport);

  assert.deepEqual(rpc.subscribeParams, {
    sessionId: "s",
    afterSeq: 2,
    maxMessages: 10,
  });

  rpc.delivered?.({
    type: "snapshot",
    cursor: 4,
    records: [{ type: "event", event: event(4) }],
    hasMore: true,
  });

  assert.deepEqual(received[0], {
    events: [event(4)],
    initial: true,
    hasMore: true,
  });

  stop();
  await Promise.resolve();
  assert.equal(rpc.closed, true);
});

test("snapshot baselines and live frames map onto the journal contract", async () => {
  const rpc = new FakeRpc();
  const transport = createRpcSessionTransport(rpc);
  const { received, frames } = await open(rpc, transport);

  rpc.delivered?.({
    type: "snapshot",
    cursor: 4,
    records: [],
    hasMore: false,
    assistantStream: {
      attemptId: "a",
      revision: 2,
      turn: 1,
      step: 1,
      chunks: [{ delta: "hel" }, { delta: "lo" }],
    },
  });
  rpc.delivered?.({
    type: "assistant-stream",
    frame: {
      type: "chunk",
      attemptId: "a",
      revision: 3,
      index: 2,
      time: 1,
      chunk: { delta: "!" },
    },
  });

  assert.deepEqual(received[0]?.assistantStream, {
    attemptId: "a",
    revision: 2,
    turn: 1,
    step: 1,
    chunks: [{ delta: "hel" }, { delta: "lo" }],
  });
  assert.equal(frames.length, 1);
});

test("live event frames deliver one durable event each", async () => {
  const rpc = new FakeRpc();
  const transport = createRpcSessionTransport(rpc);
  const { received } = await open(rpc, transport);

  rpc.delivered?.({ type: "event", event: event(5) });

  assert.deepEqual(received[0], {
    events: [event(5)],
    initial: false,
    hasMore: false,
  });
});

test("loadOlder forwards the cursor and returns the raw page", async () => {
  const rpc = new FakeRpc();
  const transport = createRpcSessionTransport(rpc);

  const page = await transport.loadOlder({
    sessionId: "s",
    beforeSeq: 5,
    limit: 2,
  });

  assert.deepEqual(rpc.pageParams, {
    sessionId: "s",
    beforeSeq: 5,
    maxMessages: 2,
  });
  assert.deepEqual(page.events.map((entry) => entry.seq), [3, 4]);
  assert.equal(page.hasMore, true);
});
