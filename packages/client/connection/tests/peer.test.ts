import test from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";

import { Peer } from "../src/peer";

test("a Peer owns a child scope and defaults to answering", async () => {
  const owner = new Context();
  const peer = await Peer.create(owner, { userId: "u1" });
  try {
    assert.equal(peer.userId, "u1");
    assert.equal(peer.interactions, "answer");
    assert.notEqual(peer.ctx, owner);
    assert.equal(peer.signal.aborted, false);
  } finally {
    await peer.dispose();
  }
});

test("disposing a Peer runs its effects in reverse order and aborts its signal", async () => {
  const owner = new Context();
  const peer = await Peer.create(owner, { userId: "u1", interactions: "none" });
  const order: string[] = [];
  peer.ctx.effect(() => () => {
    order.push("first");
  });
  peer.ctx.effect(() => () => {
    order.push("second");
  });

  await Promise.all([peer.dispose(), peer.dispose()]);
  assert.deepEqual(order, ["second", "first"]);
  assert.equal(peer.signal.aborted, true);
});

test("unloading the owner disposes every Peer it created", async () => {
  const owner = new Context();
  const peer = await Peer.create(owner, { userId: "u1" });
  let cleaned = false;
  peer.ctx.effect(() => () => {
    cleaned = true;
  });

  await owner.fiber.dispose();
  assert.equal(cleaned, true);
  assert.equal(peer.signal.aborted, true);
});
