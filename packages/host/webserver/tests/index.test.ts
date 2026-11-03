import test from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import type { Duplex } from "node:stream";

import { Context } from "@deepseek-ai/cordis";

import { WebServer } from "../src/index";

interface Running {
  readonly ctx: Context;
  readonly origin: string;
  readonly dispose: () => Promise<void>;
}

async function start(): Promise<Running> {
  const ctx = new Context();
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  const port = ctx.webServer.port;
  if (port === undefined) throw new Error("webserver did not bind");
  return {
    ctx,
    origin: `http://127.0.0.1:${String(port)}`,
    dispose: () => ctx.fiber.dispose(),
  };
}

test("exact and prefix routes dispatch, longest prefix wins, unmatched is 404", async () => {
  const server = await start();
  try {
    const hits: string[] = [];
    server.ctx.effect(() =>
      server.ctx.webServer.register({
        kind: "exact",
        path: "/health",
        handler: (_req, res) => {
          hits.push("exact");
          res.writeHead(200);
          res.end("ok");
        },
      }),
    );
    server.ctx.effect(() =>
      server.ctx.webServer.register({
        kind: "prefix",
        path: "/api",
        handler: (_req, res) => {
          hits.push("api");
          res.writeHead(200);
          res.end("api");
        },
      }),
    );
    server.ctx.effect(() =>
      server.ctx.webServer.register({
        kind: "prefix",
        path: "/api/session",
        handler: (_req, res) => {
          hits.push("session");
          res.writeHead(200);
          res.end("session");
        },
      }),
    );

    const exact = await fetch(`${server.origin}/health`);
    assert.equal(exact.status, 200);
    assert.equal(await exact.text(), "ok");

    const nested = await fetch(`${server.origin}/api/session/list`);
    assert.equal(await nested.text(), "session");

    const sibling = await fetch(`${server.origin}/api/other`);
    assert.equal(await sibling.text(), "api");

    const missing = await fetch(`${server.origin}/nope`);
    assert.equal(missing.status, 404);
    assert.deepEqual(hits, ["exact", "session", "api"]);
  } finally {
    await server.dispose();
  }
});

test("duplicate registrations reject and disposers remove routes", async () => {
  const server = await start();
  try {
    const remove = server.ctx.webServer.register({
      kind: "exact",
      path: "/once",
      handler: (_req, res) => {
        res.writeHead(200);
        res.end("once");
      },
    });
    assert.throws(
      () =>
        server.ctx.webServer.register({
          kind: "exact",
          path: "/once",
          handler: () => undefined,
        }),
      /duplicate exact route/,
    );
    server.ctx.webServer.registerUpgrade({
      path: "/socket",
      handler: () => undefined,
    });
    assert.throws(
      () =>
        server.ctx.webServer.registerUpgrade({
          path: "/socket",
          handler: () => undefined,
        }),
      /duplicate upgrade route/,
    );

    assert.equal((await fetch(`${server.origin}/once`)).status, 200);
    remove();
    assert.equal((await fetch(`${server.origin}/once`)).status, 404);
  } finally {
    await server.dispose();
  }
});

test("an upgrade route owns the socket and disposal destroys it", async () => {
  const server = await start();
  const port = server.ctx.webServer.port;
  if (port === undefined) throw new Error("webserver did not bind");
  let handled = false;
  let upgraded: Duplex | undefined;
  server.ctx.effect(() =>
    server.ctx.webServer.registerUpgrade({
      path: "/socket",
      handler: (_req, socket) => {
        handled = true;
        upgraded = socket;
        socket.write(
          "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n",
        );
      },
    }),
  );

  const socket = connect(port, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.write(
      `GET /socket HTTP/1.1\r\nHost: 127.0.0.1:${String(port)}\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n`,
    );
    socket.once("data", () => resolve());
  });

  try {
    assert.equal(handled, true);
    assert.notEqual(upgraded, undefined);
    const closed = new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
    });
    await server.dispose();
    await closed;
  } finally {
    socket.destroy();
  }
});
