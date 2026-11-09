import test from "node:test";
import assert from "node:assert/strict";

import type { SessionEvent } from "@openai-harness/session";
import { SessionSeq } from "@openai-harness/session";
import {
  SessionController,
  type SessionJournalDelivery,
  type SessionJournalPage,
  type SessionJournalTransport,
} from "../src/client/session.controller";

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

/** Scriptable transport: test decides each delivery and page. */
class FakeTransport implements SessionJournalTransport {
  deliveries: SessionJournalDelivery[] = [];
  pages: SessionJournalPage[] = [];
  pageRequests: Array<{ beforeSeq?: number; limit?: number }> = [];
  unsubscribed = false;

  subscribe(params: {
    onDelivery: (delivery: SessionJournalDelivery) => void;
  }): () => void {
    this.emit = params.onDelivery;
    return () => {
      this.unsubscribed = true;
    };
  }

  emit: ((delivery: SessionJournalDelivery) => void) | undefined;

  failNext = false;

  async loadOlder(params: {
    beforeSeq?: number;
    limit?: number;
  }): Promise<SessionJournalPage> {
    this.pageRequests.push(params);
    if (this.failNext) {
      this.failNext = false;
      throw new Error("boom");
    }
    return this.pages.shift() ?? { events: [], hasMore: false };
  }

  deliver(delivery: SessionJournalDelivery): void {
    this.emit?.(delivery);
  }
}

test("opening delivery replaces the window and records hasMore", () => {
  const transport = new FakeTransport();
  const controller = new SessionController("s1", transport);
  controller.open();

  transport.deliver({
    events: [event(1), event(2)],
    initial: true,
    hasMore: true,
  });

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.status, "open");
  assert.deepEqual(snapshot.window.events.map((e) => e.seq), [1, 2]);
  assert.equal(snapshot.window.hasMore, true);
  assert.equal(snapshot.baseSeq, 1);
});

test("live batches append and replay duplicates are ignored", () => {
  const transport = new FakeTransport();
  const controller = new SessionController("s1", transport);
  controller.open();
  transport.deliver({ events: [event(1), event(2)], initial: true, hasMore: false });

  transport.deliver({ events: [event(2), event(3)], initial: false, hasMore: false });

  assert.deepEqual(
    controller.getSnapshot().window.events.map((e) => e.seq),
    [1, 2, 3],
  );
});

test("loadOlder prepends before baseSeq and carries hasMore", async () => {
  const transport = new FakeTransport();
  const controller = new SessionController("s1", transport);
  controller.open();
  transport.deliver({ events: [event(10), event(11)], initial: true, hasMore: true });

  transport.pages.push({ events: [event(8), event(9)], hasMore: false });
  await controller.loadOlder(2);

  assert.deepEqual(transport.pageRequests, [
    { sessionId: "s1", beforeSeq: 10, limit: 2 },
  ]);
  const snapshot = controller.getSnapshot();
  assert.deepEqual(snapshot.window.events.map((e) => e.seq), [8, 9, 10, 11]);
  assert.equal(snapshot.window.hasMore, false);
  assert.equal(snapshot.baseSeq, 8);
});

test("loadOlder no-ops without older history or before opening", async () => {
  const transport = new FakeTransport();
  const controller = new SessionController("s1", transport);

  await controller.loadOlder();
  assert.equal(transport.pageRequests.length, 0);

  controller.open();
  transport.deliver({ events: [event(1)], initial: true, hasMore: false });
  await controller.loadOlder();
  assert.equal(transport.pageRequests.length, 0);
});

test("a failed older page keeps the journal open for retry", async () => {
  const transport = new FakeTransport();
  const controller = new SessionController("s1", transport);
  controller.open();
  transport.deliver({ events: [event(10)], initial: true, hasMore: true });

  transport.failNext = true;
  await controller.loadOlder();

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.status, "open");
  assert.equal(snapshot.loadingOlder, false);
  assert.equal(snapshot.window.hasMore, true);
});

test("close stops delivery and notifies subscribers", () => {
  const transport = new FakeTransport();
  const controller = new SessionController("s1", transport);
  let notifications = 0;
  controller.subscribe(() => {
    notifications += 1;
  });

  controller.open();
  controller.close();

  assert.equal(transport.unsubscribed, true);
  assert.equal(controller.getSnapshot().status, "closed");
  assert.ok(notifications >= 2);
});
