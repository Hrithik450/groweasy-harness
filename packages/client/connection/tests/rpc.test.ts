import test from "node:test";
import assert from "node:assert/strict";

import { createWebConnectionRpc, type RpcFetch } from "../src/client/rpc";

function response(rpcId: string, result: unknown): Response {
  return Response.json({ type: "server-response", rpcId, result });
}

test("call posts the exact client-request envelope", async () => {
  const calls: { input: string; init: RequestInit }[] = [];
  const fetchImpl: RpcFetch = (input, init) => {
    calls.push({ input: String(input), init });
    const body = JSON.parse(String(init.body)) as { rpcId: string };
    return Promise.resolve(response(body.rpcId, { ok: true, value: 42 }));
  };

  const rpc = createWebConnectionRpc(fetchImpl);
  const result = await rpc.call("/api", "session/list", { args: {} });

  assert.deepEqual(result, { ok: true, value: 42 });
  assert.equal(calls[0]?.input, "api/session/list");
  assert.equal(calls[0]?.init.method, "POST");
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers["content-type"], "application/json");
  assert.match(
    headers["x-user-id"] ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  const body = JSON.parse(String(calls[0]?.init.body)) as {
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

test("a failure result is returned, not thrown", async () => {
  const fetchImpl: RpcFetch = (_input, init) => {
    const body = JSON.parse(String(init.body)) as { rpcId: string };
    return Promise.resolve(
      response(body.rpcId, {
        ok: false,
        error: { code: "not_found", message: "missing", details: { id: "s1" } },
      }),
    );
  };
  const result = await createWebConnectionRpc(fetchImpl).call(
    "/api",
    "session/inspect",
    { args: { sessionId: "s1" } },
  );
  assert.deepEqual(result, {
    ok: false,
    error: { code: "not_found", message: "missing", details: { id: "s1" } },
  });
});

test("HTTP failures and correlation mismatches reject", async () => {
  await assert.rejects(
    () =>
      createWebConnectionRpc(() =>
        Promise.resolve(new Response("nope", { status: 500 })),
      ).call("/api", "session/list", { args: {} }),
    /HTTP 500/,
  );

  await assert.rejects(
    () =>
      createWebConnectionRpc(() =>
        Promise.resolve(response("different", { ok: true, value: null })),
      ).call("/api", "session/list", { args: {} }),
    /rpcId mismatch/,
  );
});

test("an abort reason rejects before the response is read", async () => {
  const abort = new AbortController();
  abort.abort(new Error("caller cancelled"));
  await assert.rejects(
    () =>
      createWebConnectionRpc(() =>
        Promise.resolve(response("ignored", { ok: true, value: null })),
      ).call("/api", "session/list", { args: {} }, abort.signal),
    /caller cancelled/,
  );
});

test("invalid targets are rejected before fetch", async () => {
  let called = false;
  const rpc = createWebConnectionRpc(() => {
    called = true;
    return Promise.resolve(response("ignored", { ok: true, value: null }));
  });
  await assert.rejects(
    () => rpc.call("api", "session/list", { args: {} }),
    /invalid RPC target/,
  );
  await assert.rejects(
    () => rpc.call("/api", "", { args: {} }),
    /invalid RPC target/,
  );
  assert.equal(called, false);
});
