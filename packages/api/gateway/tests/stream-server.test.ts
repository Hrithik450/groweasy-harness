import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Context } from "@deepseek-ai/cordis";
import type { PeerScope } from "@openai-harness/client-connection";
import { RemoteError, remoteErrorOf } from "@openai-harness/sdk-protocol";
import WebSocket from "ws";
import {
  RemoteStreamMuxServer,
  type RemoteStreamFailureMapper,
  type RemoteStreamOpener,
} from "../src/stream-server";

interface Running {
  readonly http: Server;
  readonly mux: RemoteStreamMuxServer;
  readonly url: string;
  readonly leave: () => void;
}

const running = new Set<Running>();

test.afterEach(async () => {
  for (const entry of [...running]) {
    running.delete(entry);
    await entry.mux.close().catch(() => undefined);
    await new Promise<void>((resolve) => {
      entry.http.close(() => resolve());
    });
  }
});

function fakePeer(): { peer: PeerScope; leave: () => void } {
  const lifetime = new AbortController();
  const disposers: (() => unknown)[] = [];
  const peer = {
    id: "peer-1",
    userId: "user-1",
    interactions: "answer" as const,
    signal: lifetime.signal,
    ctx: {
      effect: (execute: () => () => unknown) => {
        const dispose = execute();
        disposers.push(dispose);
        return dispose;
      },
    } as unknown as Context,
    dispose: () => {
      lifetime.abort();
      return Promise.resolve();
    },
  };
  return {
    peer,
    leave: () => {
      lifetime.abort();
      for (const dispose of disposers.splice(0)) dispose();
    },
  };
}

const failure: RemoteStreamFailureMapper = (error) => {
  const remote = remoteErrorOf(error);
  return remote === undefined
    ? {
        code: "gateway/internal",
        message: error instanceof Error ? error.message : String(error),
        details: {},
      }
    : { code: remote.code, message: remote.message, details: remote.details };
};

async function start(
  open: RemoteStreamOpener,
  inboxBytes = 262_144,
): Promise<Running> {
  const http = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  const mux = new RemoteStreamMuxServer(open, failure, 1_000, inboxBytes);
  const { peer, leave } = fakePeer();
  http.on("upgrade", (req, socket, head) => {
    mux.handleUpgrade(req, socket, head, peer);
  });
  await new Promise<void>((resolve) => {
    http.listen(0, "127.0.0.1", resolve);
  });
  const port = (http.address() as AddressInfo).port;
  const entry: Running = {
    http,
    mux,
    url: `ws://127.0.0.1:${String(port)}/api/remote.mux`,
    leave,
  };
  running.add(entry);
  return entry;
}

async function connect(url: string): Promise<WebSocket> {
  const client = new WebSocket(url);
  await once(client, "open");
  return client;
}

function openFrame(streamId: string): string {
  return JSON.stringify({
    type: "open",
    streamId,
    endpoint: "session/follow",
    payload: { args: {} },
  });
}

function waitForAbort(signal: AbortSignal): AsyncIterable<never> {
  return (async function* () {
    await new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        reject(signal.reason);
      }, { once: true });
    });
  })();
}

function frameText(value: unknown): string {
  return JSON.stringify(value);
}

test("a binary frame closes the socket with 1003", async () => {
  const entry = await start(async (_endpoint, _payload, _uplink, _peer, control) => waitForAbort(control.signal));
  const client = await connect(entry.url);
  const closed = once(client, "close");
  client.send(Buffer.from("{}"));
  const [code] = await closed;
  assert.equal(code, 1003);
});

test("malformed and duplicate opens close with 1008", async () => {
  const entry = await start(async (_endpoint, _payload, _uplink, _peer, control) => waitForAbort(control.signal));

  const malformed = await connect(entry.url);
  const malformedClosed = once(malformed, "close");
  malformed.send("not json");
  const [malformedCode, malformedReason] = await malformedClosed;
  assert.equal(malformedCode, 1008);
  assert.equal(String(malformedReason), "invalid Remote stream request");

  const duplicate = await connect(entry.url);
  const duplicateClosed = once(duplicate, "close");
  duplicate.send(openFrame("same"));
  duplicate.send(openFrame("same"));
  const [duplicateCode, duplicateReason] = await duplicateClosed;
  assert.equal(duplicateCode, 1008);
  assert.equal(String(duplicateReason), "invalid Remote stream request");
});

test("items and end travel in opener order", async () => {
  const entry = await start(async () =>
    (async function* () {
      yield { n: 1 };
      yield { n: 2 };
    })(),
  );
  const client = await connect(entry.url);
  const frames: unknown[] = [];
  const ended = new Promise<void>((resolve) => {
    client.on("message", (data) => {
      const frame = JSON.parse(String(data)) as { type: string };
      frames.push(frame);
      if (frame.type === "end") resolve();
    });
  });
  client.send(openFrame("ordered"));
  await ended;
  client.close();

  assert.deepEqual(frames, [
    { type: "item", streamId: "ordered", value: { n: 1 } },
    { type: "item", streamId: "ordered", value: { n: 2 } },
    { type: "end", streamId: "ordered" },
  ]);
});

test("an overflowing uplink fails the stream with gateway/uplink-overflow", async () => {
  let started!: () => void;
  const didStart = new Promise<void>((resolve) => {
    started = resolve;
  });
  const entry = await start(
    async (_endpoint, _payload, uplink) => {
      started();
      return (async function* () {
        for await (const value of uplink) {
          yield value;
        }
      })();
    },
    64,
  );
  const client = await connect(entry.url);
  const failureFrame = new Promise<{ code: string }>((resolve) => {
    client.on("message", (data) => {
      const frame = JSON.parse(String(data)) as {
        type: string;
        error?: { code: string };
      };
      if (frame.type === "error" && frame.error) {
        resolve(frame.error);
      }
    });
  });
  client.send(openFrame("overflow"));
  await didStart;
  client.send(
    frameText({
      type: "item",
      streamId: "overflow",
      value: "x".repeat(200),
    }),
  );
  const error = await failureFrame;
  assert.equal(error.code, "gateway/uplink-overflow");
  client.close();
});

test("an item after the Client end fails with gateway/protocol", async () => {
  let started!: () => void;
  const didStart = new Promise<void>((resolve) => {
    started = resolve;
  });
  const entry = await start(async (_endpoint, _payload, uplink) => {
    started();
    return (async function* () {
      for await (const value of uplink) {
        yield value;
      }
      // Hold the stream open until the late item has been dispatched, so the
      // violation races the write rather than a completed logical stream.
      await new Promise((resolve) => setTimeout(resolve, 20));
    })();
  });
  const client = await connect(entry.url);
  const failureFrame = new Promise<{ code: string }>((resolve) => {
    client.on("message", (data) => {
      const frame = JSON.parse(String(data)) as {
        type: string;
        error?: { code: string };
      };
      if (frame.type === "error" && frame.error) resolve(frame.error);
    });
  });
  client.send(openFrame("after-end"));
  await didStart;
  client.send(frameText({ type: "end", streamId: "after-end" }));
  client.send(
    frameText({ type: "item", streamId: "after-end", value: "late" }),
  );
  const error = await failureFrame;
  assert.equal(error.code, "gateway/protocol");
  client.close();
});

test("cancel aborts the opener without an end or error frame", async () => {
  let started!: () => void;
  const didStart = new Promise<void>((resolve) => {
    started = resolve;
  });
  const entry = await start(async (_endpoint, _payload, _uplink, _peer, control) => {
    started();
    return waitForAbort(control.signal);
  });
  const client = await connect(entry.url);
  const frames: unknown[] = [];
  client.on("message", (data) => {
    frames.push(JSON.parse(String(data)));
  });
  client.send(openFrame("cancelled"));
  await didStart;
  client.send(frameText({ type: "cancel", streamId: "cancelled" }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(frames, []);
  client.close();
});

test("close terminates clients and awaits their streams", async () => {
  const entry = await start(async (_endpoint, _payload, _uplink, _peer, control) => waitForAbort(control.signal));
  const client = await connect(entry.url);
  const closed = once(client, "close");
  await entry.mux.close();
  await closed;
  assert.equal(client.readyState, WebSocket.CLOSED);
});

test("a Remote failure as the abort reason is delivered to the client", async () => {
  const entry = await start(async (_endpoint, _payload, _uplink, _peer, control) => {
    control.abort(
      new RemoteError("gateway/protocol", "api gateway: fixture", {
        endpoint: "session/follow",
      }),
    );
    return (async function* () {})();
  });
  const client = await connect(entry.url);
  const failureFrame = new Promise<{ code: string }>((resolve) => {
    client.on("message", (data) => {
      const frame = JSON.parse(String(data)) as {
        type: string;
        error?: { code: string };
      };
      if (frame.type === "error" && frame.error) resolve(frame.error);
    });
  });
  client.send(openFrame("remote-failure"));
  const error = await failureFrame;
  assert.equal(error.code, "gateway/protocol");
  client.close();
});
