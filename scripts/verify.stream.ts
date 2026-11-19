/**
 * Lifecycle check for the session stream reader.
 *
 * Run with: npx tsx scripts/verify.stream.ts
 *
 * Verifies that subscribers share one socket per session, that the first open
 * is silent (the page rendered the journal), that only a restored connection
 * fires `onReconnect`, and that the registry never leaks an entry.
 */

import assert from "node:assert/strict";
import { subscribeSessionStream } from "../src/lib/session/stream";

const controllers = new Map<
  string,
  ReadableStreamDefaultController<Uint8Array>
>();
let opened = 0;
let aborted = 0;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const sessionId = url.split("/sessions/")[1]?.split("/")[0] ?? "?";
  opened += 1;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controllers.set(sessionId, controller);
    },
  });

  init?.signal?.addEventListener("abort", () => {
    aborted += 1;
    try {
      controllers.get(sessionId)?.error(new Error("aborted"));
    } catch {}
  });

  return new Response(body, { status: 200 });
}) as typeof fetch;

function tick(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function push(sessionId: string, event: string, data: unknown): void {
  const controller = controllers.get(sessionId);
  assert.ok(controller, `no open stream for ${sessionId}`);
  controller.enqueue(
    new TextEncoder().encode(
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    ),
  );
}

function drop(sessionId: string): void {
  controllers.get(sessionId)?.error(new Error("dropped"));
}

async function main(): Promise<void> {
  // --- two consumers of the same session share one socket ---
  const seenByA: string[] = [];
  let reconnectedA1 = 0;
  let reconnectedA2 = 0;

  const a1 = subscribeSessionStream(
    "a",
    (m) => seenByA.push(m.event),
    () => { reconnectedA1 += 1; },
  );
  const a2 = subscribeSessionStream(
    "a",
    (m) => seenByA.push(m.event),
    () => { reconnectedA2 += 1; },
  );
  await tick();

  assert.equal(opened, 1, "two subscribers must open exactly one socket");
  assert.equal(reconnectedA1, 0, "first open is silent");
  assert.equal(reconnectedA2, 0, "first open is silent for every subscriber");

  push("a", "journal", { type: "append" });
  await tick();
  assert.deepEqual(seenByA, ["journal", "journal"], "both receive the frame");

  // --- a drop reconnects, and that restored connection notifies ---
  drop("a");
  await tick(1_200);
  assert.equal(opened, 2, "dropped stream reconnects");
  assert.equal(reconnectedA1, 1, "reconnect handler fires after a drop");
  assert.equal(reconnectedA2, 1, "every subscriber hears the reconnect");

  // --- first unsubscribe keeps the socket open ---
  a1();
  await tick();
  assert.equal(aborted, 0, "one remaining subscriber keeps the socket");

  // --- last unsubscribe closes it ---
  a2();
  await tick();
  assert.equal(aborted, 1, "last subscriber closes the socket");

  // --- switching sessions opens the new one only ---
  const b = subscribeSessionStream("b", () => {}, () => {});
  await tick();
  assert.equal(opened, 3, "new session opens its own socket");
  b();
  await tick();
  assert.equal(aborted, 2, "leaving the new session closes it");

  // --- re-opening a session is a restore, so it notifies ---
  let reopenedA = 0;
  const a3 = subscribeSessionStream("a", () => {}, () => {
    reopenedA += 1;
  });
  await tick();
  assert.equal(opened, 4, "re-subscribing opens a new socket");
  assert.equal(reopenedA, 1, "re-open notifies as a restore");
  a3();
  await tick();
  assert.equal(aborted, 3, "cleanup aborts the re-opened socket");

  console.log("stream lifecycle: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
