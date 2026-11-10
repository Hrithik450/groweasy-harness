import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { bridge } from "../src/http-bridge";
import type { ConnectionFetchHandler } from "../src/rpc";

interface Running {
  readonly origin: string;
  readonly close: () => Promise<void>;
}

const running = new Set<Server>();

test.afterEach(async () => {
  for (const server of [...running]) {
    running.delete(server);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

async function start(
  handler: ConnectionFetchHandler,
  maxRequestBodyBytes?: number,
): Promise<Running> {
  const server = createServer((req, res) => {
    void bridge(req, res, handler, { userId: "u1" }, maxRequestBodyBytes);
  });
  running.add(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

test("a buffered request reaches the Fetch handler and its response is written", async () => {
  const seen: Request[] = [];
  const running = await start({
    requestBodyMode: () => "buffered",
    fetch: (request, peer) => {
      seen.push(request);
      return Promise.resolve(
        Response.json({
          method: request.method,
          url: request.url,
          header: request.headers.get("x-probe"),
          body: peer.userId,
        }),
      );
    },
  });

  const response = await fetch(`${running.origin}/api/session/list`, {
    method: "POST",
    headers: { "x-probe": "yes", "content-type": "application/json" },
    body: '{"ok":true}',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    method: "POST",
    url: "http://gateway.internal/api/session/list",
    header: "yes",
    body: "u1",
  });
  assert.equal(await seen[0]?.text(), '{"ok":true}');
});

test("a declared body above the cap is rejected with 413 before dispatch", async () => {
  let dispatched = false;
  const running = await start(
    {
      requestBodyMode: () => "buffered",
      fetch: () => {
        dispatched = true;
        return Promise.resolve(Response.json({ ok: true }));
      },
    },
    8,
  );

  const response = await fetch(`${running.origin}/api/session/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(32),
  }).catch(() => undefined);

  if (response !== undefined) {
    assert.equal(response.status, 413);
  }
  assert.equal(dispatched, false);
});

test("a streamed body mode hands the raw request stream to the handler", async () => {
  const running = await start({
    requestBodyMode: () => "streaming",
    fetch: async (request) => {
      const text = await request.text();
      return new Response(`streamed:${text}`, { status: 201 });
    },
  });

  const response = await fetch(`${running.origin}/api/upload`, {
    method: "POST",
    body: "payload",
  });
  assert.equal(response.status, 201);
  assert.equal(await response.text(), "streamed:payload");
});
