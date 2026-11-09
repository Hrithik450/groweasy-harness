import test from "node:test";
import assert from "node:assert/strict";

import { RemoteError } from "@openai-harness/sdk-protocol";
import {
  ClientUplinkQueue,
  RemoteStreamCarrierError,
  RemoteStreamMuxClient,
  type ConnectionWebSocket,
  type RemoteStreamSocketEvent,
} from "../src/client/stream-client";

interface Listener {
  readonly listener: (event: RemoteStreamSocketEvent) => void;
  readonly once: boolean;
}

class FakeSocket implements ConnectionWebSocket {
  readyState = 0;
  readonly sent: string[] = [];
  readonly closeCalls: { code?: number; reason?: string }[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: RemoteStreamSocketEvent) => void,
    options?: { readonly once?: boolean },
  ): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add({ listener, once: options?.once === true });
    this.listeners.set(type, set);
  }

  removeEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: RemoteStreamSocketEvent) => void,
  ): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const entry of set) {
      if (entry.listener === listener) set.delete(entry);
    }
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", {});
  }

  open(): void {
    this.readyState = 1;
    this.emit("open", {});
  }

  receive(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  received(index: number): Record<string, unknown> {
    return JSON.parse(this.sent[index] ?? "null") as Record<string, unknown>;
  }

  private emit(type: string, event: RemoteStreamSocketEvent): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const entry of [...set]) {
      entry.listener(event);
      if (entry.once) set.delete(entry);
    }
  }
}

function setup(): {
  client: RemoteStreamMuxClient;
  socket: () => FakeSocket;
  sockets: FakeSocket[];
} {
  const sockets: FakeSocket[] = [];
  const client = new RemoteStreamMuxClient(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  return {
    client,
    sockets,
    socket: () => {
      const socket = sockets[0];
      if (socket === undefined) throw new Error("socket not created");
      return socket;
    },
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("open sends the exact frame and yields items through end", async () => {
  const { client, socket } = setup();
  client.start();
  const controller = new AbortController();
  const reading = (async () => {
    const values: unknown[] = [];
    for await (const value of client.open(
      "session/follow",
      { args: { sessionId: "s1" } },
      controller.signal,
    )) {
      values.push(value);
    }
    return values;
  })();

  socket().open();
  await tick();
  const opened = socket().received(0);
  assert.equal(opened.type, "open");
  assert.equal(opened.endpoint, "session/follow");
  assert.deepEqual(opened.payload, { args: { sessionId: "s1" } });
  const streamId = String(opened.streamId);

  socket().receive({ type: "item", streamId, value: 1 });
  socket().receive({ type: "item", streamId, value: 2 });
  socket().receive({ type: "end", streamId });

  assert.deepEqual(await reading, [1, 2]);
  await client.close();
});

test("an error frame throws a RemoteError with its code", async () => {
  const { client, socket } = setup();
  client.start();
  const controller = new AbortController();
  const reading = (async () => {
    for await (const _value of client.open(
      "session/follow",
      { args: {} },
      controller.signal,
    )) {
      // no items
    }
  })();

  socket().open();
  await tick();
  const streamId = String(socket().received(0).streamId);
  socket().receive({
    type: "error",
    streamId,
    error: {
      code: "gateway/uplink-overflow",
      message: "too much",
      details: { endpoint: "session/follow" },
    },
  });

  await assert.rejects(
    reading,
    (error: unknown) =>
      error instanceof RemoteError &&
      error.code === "gateway/uplink-overflow" &&
      error.message === "too much",
  );
  await client.close();
});

test("a closed carrier fails an open stream with RemoteStreamCarrierError", async () => {
  const { client, socket } = setup();
  client.start();
  const controller = new AbortController();
  const reading = (async () => {
    for await (const _value of client.open(
      "session/follow",
      { args: {} },
      controller.signal,
    )) {
      // no items
    }
  })();

  socket().open();
  await tick();
  socket().close();

  await assert.rejects(
    reading,
    (error: unknown) => error instanceof RemoteStreamCarrierError,
  );
  await client.close();
});

test("an invalid Host frame closes the socket with 4002", async () => {
  const { client, socket } = setup();
  client.start();
  const controller = new AbortController();
  const reading = (async () => {
    for await (const _value of client.open(
      "session/follow",
      { args: {} },
      controller.signal,
    )) {
      // no items
    }
  })();

  socket().open();
  await tick();
  socket().receive({ type: "item", streamId: "", value: 1 });

  await assert.rejects(
    reading,
    (error: unknown) => error instanceof RemoteStreamCarrierError,
  );
  assert.deepEqual(socket().closeCalls[0], {
    code: 4002,
    reason: "invalid Remote stream frame",
  });
  await client.close();
});

test("cancel from the consumer sends a cancel frame once", async () => {
  const { client, socket } = setup();
  client.start();
  const controller = new AbortController();
  const reading = (async () => {
    for await (const _value of client.open(
      "session/follow",
      { args: {} },
      controller.signal,
    )) {
      // no items
    }
  })();

  socket().open();
  await tick();
  controller.abort(new Error("consumer cancelled"));
  await assert.rejects(reading, /consumer cancelled/);
  const streamId = String(socket().received(0).streamId);
  assert.deepEqual(socket().received(1), { type: "cancel", streamId });
  await client.close();
});

test("an uplink queue sends items then end and closes with the stream", async () => {
  const { client, socket } = setup();
  client.start();
  const controller = new AbortController();
  const uplink = new ClientUplinkQueue("session/follow");
  const reading = (async () => {
    for await (const _value of client.open(
      "session/follow",
      { args: {} },
      controller.signal,
      uplink,
    )) {
      // no downlink items
    }
  })();

  socket().open();
  await tick();
  uplink.push({ n: 1 });
  uplink.push({ n: 2 });
  uplink.end();
  await tick();

  assert.deepEqual(
    socket().sent.slice(1).map((text) => JSON.parse(text)),
    [
      { type: "item", streamId: socket().received(0).streamId, value: { n: 1 } },
      { type: "item", streamId: socket().received(0).streamId, value: { n: 2 } },
      { type: "end", streamId: socket().received(0).streamId },
    ],
  );

  const streamId = String(socket().received(0).streamId);
  socket().receive({ type: "end", streamId });
  await reading;
  assert.throws(() => {
    uplink.push({ n: 3 });
  }, /uplink was ended|stream has terminated/);
  await client.close();
});
