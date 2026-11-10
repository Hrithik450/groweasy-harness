import test from "node:test";
import assert from "node:assert/strict";

import { Context, Service } from "@deepseek-ai/cordis";
import { WebServer } from "@openai-harness/host-webserver";

import HostConnectionService from "../src/rpc-host";
import type {
  BrowserIdentity,
  BrowserIdentityRequest,
} from "../src/browser-auth";
import { isUuidV7 } from "../src/user-id";

/** The moved host half keeps its `/api` route behavior; only its owner changed. */

/** Fixed UUIDv7 used when the request supplies none. */
const MINTED_USER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

/** Test double: the transport only asks for the user id. */
class StubBrowserAuth extends Service {
  constructor(ctx: Context) {
    super(ctx, "browserAuth");
  }

  async authenticate(cookieHeader: string | undefined): Promise<string | null> {
    return cookieHeader?.includes("ads-easy-session=ok") ? "user-1" : null;
  }

  async resolve(request: BrowserIdentityRequest): Promise<BrowserIdentity> {
    const cookie = request.cookie?.includes("ads-easy-session=ok")
      ? "user-1"
      : undefined;
    if (cookie !== undefined) {
      return {
        userId: cookie,
        authenticated: true,
        anonymous: false,
        minted: false,
      };
    }
    const supplied = request.headerUserId ?? request.queryUserId;
    const userId =
      typeof supplied === "string" && isUuidV7(supplied)
        ? supplied
        : MINTED_USER_ID;
    return {
      userId,
      authenticated: false,
      anonymous: true,
      minted: userId === MINTED_USER_ID,
    };
  }
}

interface Running {
  readonly ctx: Context;
  readonly origin: string;
}

async function start(): Promise<Running> {
  const ctx = new Context();
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  await ctx.plugin(StubBrowserAuth);
  await ctx.plugin(HostConnectionService, {
    allowedOrigins: ["http://allowed.test"],
  });
  const port = ctx.webServer.port;
  if (port === undefined) throw new Error("webserver did not bind");
  return { ctx, origin: `http://127.0.0.1:${String(port)}` };
}

test("the /api route rejects a foreign Origin before admission", async () => {
  const running = await start();
  try {
    const response = await fetch(`${running.origin}/api/session/list`, {
      method: "POST",
      headers: { origin: "http://evil.test", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 403);
    assert.equal(await response.text(), "forbidden");
  } finally {
    await running.ctx.fiber.dispose();
  }
});

test("the /api preflight answers CORS without credentials", async () => {
  const running = await start();
  try {
    const response = await fetch(`${running.origin}/api/session/list`, {
      method: "OPTIONS",
      headers: {
        origin: "http://allowed.test",
        "access-control-request-method": "POST",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://allowed.test",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
    );
    assert.equal(
      response.headers.get("access-control-allow-methods"),
      "POST, OPTIONS",
    );
    assert.equal(
      response.headers.get("access-control-allow-headers"),
      "content-type, x-user-id",
    );
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      "x-user-id",
    );
  } finally {
    await running.ctx.fiber.dispose();
  }
});

test("an allowed Origin without a session cookie is admitted anonymously", async () => {
  const running = await start();
  try {
    const response = await fetch(`${running.origin}/api/session/list`, {
      method: "POST",
      headers: {
        origin: "http://allowed.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "client-request",
        rpcId: "r1",
        method: "session/list",
        payload: { args: {} },
      }),
    });
    // No interceptor is registered in this fixture, so the carrier reaches its
    // handler and answers 404; the point is that it was not rejected.
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-user-id"), MINTED_USER_ID);
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      "x-user-id",
    );
  } finally {
    await running.ctx.fiber.dispose();
  }
});

test("a caller-supplied x-user-id is admitted and echoed", async () => {
  const running = await start();
  try {
    const supplied = "018f2c3d-4e5f-7a6b-8c9d-0e1f2a3b4c5d";
    const response = await fetch(`${running.origin}/api/session/list`, {
      method: "POST",
      headers: {
        origin: "http://allowed.test",
        "content-type": "application/json",
        "x-user-id": supplied,
      },
      body: "{}",
    });
    assert.equal(response.headers.get("x-user-id"), supplied);
  } finally {
    await running.ctx.fiber.dispose();
  }
});

test("disposing the service unloads its routes", async () => {
  const running = await start();
  await running.ctx.fiber.dispose();
  await assert.rejects(fetch(`${running.origin}/api/session/list`), /fetch failed/);
});
