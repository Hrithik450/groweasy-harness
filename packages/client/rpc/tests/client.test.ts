import test from "node:test";
import assert from "node:assert/strict";

import { SessionSeq, type SessionEvent } from "@openai-harness/session";
import {
  RpcClient,
  RpcClientError,
  type RpcSocket,
  type RpcSocketFactory,
} from "../src/client";

interface Listener {
  readonly listener: (event: { readonly data?: unknown }) => void;
  readonly once: boolean;
}

class FakeSocket implements RpcSocket {
  readyState = 0;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: { readonly data?: unknown }) => void,
    options?: { readonly once?: boolean },
  ): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add({ listener, once: options?.once === true });
    this.listeners.set(type, set);
  }

  removeEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: { readonly data?: unknown }) => void,
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

  close(): void {
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

  drop(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", {});
  }

  sentAt(index: number): Record<string, unknown> {
    return JSON.parse(this.sent[index] ?? "null") as Record<string, unknown>;
  }

  private emit(type: string, event: { readonly data?: unknown }): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const entry of [...set]) {
      entry.listener(event);
      if (entry.once) set.delete(entry);
    }
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

test("call posts a client-request to the method's HTTP endpoint", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const client = new RpcClient({
    url: "ws://gateway.test",
    autoReconnect: false,
    fetch: (input, init) => {
      requests.push({ url: String(input), init });
      const message = JSON.parse(String(init.body)) as { rpcId: string };
      return Promise.resolve(
        Response.json({
          type: "server-response",
          rpcId: message.rpcId,
          result: { ok: true, value: [{ id: "s1" }] },
        }),
      );
    },
  });

  const result = await client.call("session.list", undefined);
  assert.deepEqual(result, [{ id: "s1" }]);
  assert.equal(requests[0]?.url, "http://gateway.test/api/session/list");
  assert.equal(requests[0]?.init.credentials, "include");
  const body = JSON.parse(String(requests[0]?.init.body)) as {
    type: string;
    rpcId: string;
    method: string;
    payload: unknown;
  };
  assert.equal(body.type, "client-request");
  assert.equal(typeof body.rpcId, "string");
  assert.equal(body.method, "session/list");
  assert.deepEqual(body.payload, { args: {} });
});

test("a failure result rejects with the gateway code", async () => {
  const client = new RpcClient({
    url: "ws://gateway.test",
    fetch: (_input, init) => {
      const message = JSON.parse(String(init.body)) as { rpcId: string };
      return Promise.resolve(
        Response.json({
          type: "server-response",
          rpcId: message.rpcId,
          result: {
            ok: false,
            error: { code: "not_found", message: "Session not found", details: {} },
          },
        }),
      );
    },
  });

  await assert.rejects(
    () => client.call("session.inspect", { sessionId: "missing" }),
    (error: unknown) =>
      error instanceof RpcClientError &&
      error.code === "not_found" &&
      error.message === "Session not found",
  );
});

test("session.follow opens the mux and delivers snapshot then live frames", async () => {
  let socket: FakeSocket | undefined;
  const factory: RpcSocketFactory = () => {
    socket = new FakeSocket();
    return socket;
  };
  const client = new RpcClient({
    url: "ws://gateway.test",
    socketFactory: factory,
    autoReconnect: false,
  });
  const frames: unknown[] = [];

  const subscribing = client.subscribe(
    "session.follow",
    { sessionId: "s1" },
    (frame) => frames.push(frame),
  );
  const stream = socket!;
  stream.open();
  await tick();

  const opened = stream.sentAt(0);
  assert.equal(opened.type, "open");
  assert.equal(opened.endpoint, "session/follow");
  assert.deepEqual(opened.payload, { args: { sessionId: "s1" } });
  const streamId = String(opened.streamId);

  stream.receive({
    type: "item",
    streamId,
    value: {
      type: "snapshot",
      cursor: 1,
      records: [{ type: "event", event: event(1) }],
      hasMore: false,
    },
  });
  const subscription = await subscribing;

  stream.receive({
    type: "item",
    streamId,
    value: { type: "event", event: event(2) },
  });
  await tick();

  assert.deepEqual(frames, [
    {
      type: "snapshot",
      cursor: 1,
      records: [{ type: "event", event: event(1) }],
      hasMore: false,
    },
    { type: "event", event: event(2) },
  ]);

  subscription.close();
  await tick();
  assert.deepEqual(stream.sentAt(1), { type: "cancel", streamId });
});

test("the stream socket URL carries the anonymous userId query", async () => {
  let openedUrl: string | undefined;
  let socket: FakeSocket | undefined;
  const factory: RpcSocketFactory = (url) => {
    openedUrl = url;
    socket = new FakeSocket();
    return socket;
  };
  const client = new RpcClient({
    url: "ws://gateway.test",
    socketFactory: factory,
    autoReconnect: false,
  });
  const subscribing = client.subscribe(
    "session.follow",
    { sessionId: "s1" },
    () => {},
  );
  const stream = socket!;
  stream.open();
  await tick();

  const url = new URL(openedUrl ?? "");
  assert.equal(url.protocol, "ws:");
  assert.equal(url.pathname, "/api/remote.mux");
  assert.match(
    url.searchParams.get("userId") ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  stream.receive({
    type: "item",
    streamId: String(stream.sentAt(0).streamId),
    value: { type: "snapshot", cursor: 0, records: [], hasMore: false },
  });
  const subscription = await subscribing;
  subscription.close();
  await tick();
});

test("a lost carrier reopens with the last accepted cursor", async () => {
  const sockets: FakeSocket[] = [];
  const factory: RpcSocketFactory = () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  };
  const client = new RpcClient({
    url: "ws://gateway.test",
    socketFactory: factory,
    autoReconnect: true,
  });

  const subscribing = client.subscribe(
    "session.follow",
    { sessionId: "s1", afterSeq: 0 },
    () => {},
  );
  sockets[0]!.open();
  await tick();
  const first = sockets[0]!.sentAt(0);
  sockets[0]!.receive({
    type: "item",
    streamId: String(first.streamId),
    value: {
      type: "snapshot",
      cursor: 5,
      records: [],
      hasMore: false,
    },
  });
  await subscribing;

  sockets[0]!.drop();
  const deadline = Date.now() + 2_000;
  while (sockets.length < 2 && Date.now() < deadline) await tick();
  assert.equal(sockets.length, 2);

  sockets[1]!.open();
  await tick();
  const reopened = sockets[1]!.sentAt(0);
  assert.deepEqual(reopened.payload, {
    args: { sessionId: "s1", afterSeq: 5 },
  });
  client.close();
});
