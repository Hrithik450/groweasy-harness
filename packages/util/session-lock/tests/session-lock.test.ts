import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acquireSessionLock,
  SessionBusyError,
} from "../src/index";

test("serializes concurrent acquirers in FIFO order", async () => {
  const sessionId = "lock-fifo";
  const order: number[] = [];

  const releaseFirst = await acquireSessionLock(sessionId, {
    timeoutMs: 1000,
  });

  const tasks = [1, 2, 3].map(async (n) => {
    const release = await acquireSessionLock(sessionId, { timeoutMs: 1000 });
    order.push(n);
    release();
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(order, []);

  releaseFirst();
  await Promise.all(tasks);

  assert.deepEqual(order, [1, 2, 3]);
});

test("times out with SessionBusyError while the lock is held", async () => {
  const sessionId = "lock-busy";
  const release = await acquireSessionLock(sessionId, { timeoutMs: 1000 });

  await assert.rejects(
    acquireSessionLock(sessionId, { timeoutMs: 10 }),
    SessionBusyError,
  );

  release();

  const releaseAgain = await acquireSessionLock(sessionId, {
    timeoutMs: 1000,
  });
  releaseAgain();
});

test("an aborted waiter never takes the lock", async () => {
  const sessionId = "lock-abort";
  const release = await acquireSessionLock(sessionId, { timeoutMs: 1000 });

  const controller = new AbortController();
  const waiting = acquireSessionLock(sessionId, {
    signal: controller.signal,
    timeoutMs: 1000,
  });

  controller.abort();
  await assert.rejects(waiting);

  release();

  const next = await acquireSessionLock(sessionId, { timeoutMs: 1000 });
  next();
});

test("release is idempotent and cannot free the next holder", async () => {
  const sessionId = "lock-idempotent";

  const releaseFirst = await acquireSessionLock(sessionId);
  releaseFirst();

  const releaseSecond = await acquireSessionLock(sessionId);

  releaseFirst();

  await assert.rejects(
    acquireSessionLock(sessionId, { timeoutMs: 10 }),
    SessionBusyError,
  );

  releaseSecond();
});
