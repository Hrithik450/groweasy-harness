import test from "node:test";
import assert from "node:assert/strict";

import {
  configureClientSession,
  getClientSessionDependencies,
  resetClientSession,
  resolveRpcClient,
  type RpcClientLike,
} from "../src/config";
import { pendingPrompts } from "../src/internal/pending";

function reset(): void {
  resetClientSession();
}

test("configureClientSession binds an rpc instance", () => {
  reset();
  const rpc: RpcClientLike = {
    async call(method) {
      return { accepted: true, method };
    },
  };

  configureClientSession({ rpc });
  assert.equal(resolveRpcClient(), rpc);
  assert.equal(getClientSessionDependencies().rpc, rpc);
});

test("configureClientSession accepts a lazy rpc provider", () => {
  reset();
  let created = 0;
  const rpc: RpcClientLike = {
    async call() {
      return { accepted: true };
    },
  };

  configureClientSession({
    rpc: () => {
      created += 1;
      return rpc;
    },
  });

  assert.equal(created, 0);
  assert.equal(resolveRpcClient(), rpc);
  assert.equal(created, 1);
  assert.equal(resolveRpcClient(), rpc);
  assert.equal(created, 2);
});

test("merging bindings preserves a previously configured rpc", () => {
  reset();
  const rpc: RpcClientLike = {
    async call() {
      return { accepted: true };
    },
  };

  configureClientSession({ rpc });
  configureClientSession({ createId: () => "fixed-id" });

  assert.equal(resolveRpcClient(), rpc);
  assert.equal(getClientSessionDependencies().createId?.(), "fixed-id");
});

test("resolveRpcClient explains the missing binding", () => {
  reset();
  assert.throws(
    () => resolveRpcClient(),
    /configureClientSession\(\{ rpc \}\)/,
  );
});

test("default pending-prompts fold drops committed submissions", () => {
  const events = [
    {
      type: "user/message",
      seq: 1,
      time: 0,
      data: {
        id: "m1",
        role: "user",
        content: [{ type: "text", text: "committed" }],
        source: { kind: "user", rpcId: "r1" },
      },
    },
  ] as unknown as Parameters<typeof pendingPrompts>[0];

  const prompts = [
    { requestId: "r1", text: "committed", createdAt: "t1" },
    { requestId: "r2", text: "pending", createdAt: "t2" },
  ];

  assert.deepEqual(pendingPrompts(events, prompts), [prompts[1]]);
  assert.deepEqual(pendingPrompts([], prompts), prompts);
});
