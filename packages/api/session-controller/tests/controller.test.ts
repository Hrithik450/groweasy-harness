import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Context } from "@deepseek-ai/cordis";
import { DETAIL_BAR_STATE_VERSION } from "@openai-harness/session-projection";
import {
  JsonlSessionPersistenceBackend,
  configureProjectionCacheLoader,
  configureSessionEventsStore,
  configureSessionStore,
  createSession,
  resetProjectionCacheLoader,
  resetSessionEventsStore,
  resetSessionStore,
  type ProjectionCacheRow,
  type ProjectionCacheTable,
} from "@openai-harness/session-persistence";
import { SessionController } from "../src/session.controller";
import { RpcError } from "../src/errors";

const CALLER = {
  userId: "user-1",
  signal: new AbortController().signal,
};

test("the Session Controller injects its host services", () => {
  assert.deepEqual(SessionController.inject, ["sessionFollow", "sessionAgent"]);
});

test("every contract method has a Session Controller member", () => {
  const members = [
    "list",
    "inspect",
    "create",
    "projection",
    "detailBar.update",
    "prompt",
    "page",
    "cancel",
    "follow",
    "block.submit",
  ];
  const prototype = SessionController.prototype as unknown as Record<
    string,
    unknown
  >;
  for (const member of members) {
    assert.equal(
      typeof prototype[member],
      "function",
      `missing Session Controller member ${member}`,
    );
  }
});

/** In-memory projection cache table bound as the process-wide loader. */
function memoryCacheTable(): ProjectionCacheTable {
  const rows = new Map<string, ProjectionCacheRow>();
  return {
    get: (key) => rows.get(key),
    put: async (key, value) => {
      rows.set(key, value);
    },
    delete: async (key) => rows.delete(key),
    keys: () => rows.keys(),
  };
}

test("projection and detailBar.update read and replace the projected state", async () => {
  const root = await mkdtemp(join(tmpdir(), "session-controller-"));
  const backend = new JsonlSessionPersistenceBackend({ root });
  try {
    configureSessionStore({
      backend,
      mintId: () => "session-1",
      userExists: () => true,
    });
    configureSessionEventsStore({ backend });
    configureProjectionCacheLoader(async () => memoryCacheTable());

    const created = await createSession({
      id: "session-1",
      userId: "user-1",
      title: "Ad Manager",
      slug: "adManager",
    });
    assert.equal(created.success, true);

    const controller = new SessionController(new Context());

    const initial = await controller.projection(
      { sessionId: "session-1" },
      CALLER,
    );
    assert.deepEqual(initial, {
      key: "detailBar",
      asOfSeq: -1,
      stateVersion: DETAIL_BAR_STATE_VERSION,
      state: { type: "adManager", data: {} },
    });

    const written = await controller["detailBar.update"](
      {
        sessionId: "session-1",
        detailBar: { type: "adManager", data: { count: 2 } },
      },
      CALLER,
    );
    assert.deepEqual(written, {
      key: "detailBar",
      asOfSeq: 0,
      stateVersion: DETAIL_BAR_STATE_VERSION,
      state: { type: "adManager", data: { count: 2 } },
    });

    const reread = await controller.projection(
      { sessionId: "session-1", key: "detailBar" },
      CALLER,
    );
    assert.deepEqual(reread, written);
  } finally {
    resetProjectionCacheLoader();
    resetSessionEventsStore();
    resetSessionStore();
    await backend.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("projection rejects an unsupported key with bad_request", async () => {
  const root = await mkdtemp(join(tmpdir(), "session-controller-"));
  const backend = new JsonlSessionPersistenceBackend({ root });
  try {
    configureSessionStore({
      backend,
      mintId: () => "session-1",
      userExists: () => true,
    });
    configureSessionEventsStore({ backend });
    configureProjectionCacheLoader(async () => memoryCacheTable());

    await createSession({
      id: "session-1",
      userId: "user-1",
      title: "Ad Manager",
      slug: "adManager",
    });

    const controller = new SessionController(new Context());
    await assert.rejects(
      () => controller.projection({ sessionId: "session-1", key: "todos" }, CALLER),
      (error: unknown) =>
        error instanceof RpcError && error.code === "bad_request",
    );
  } finally {
    resetProjectionCacheLoader();
    resetSessionEventsStore();
    resetSessionStore();
    await backend.close();
    await rm(root, { recursive: true, force: true });
  }
});
