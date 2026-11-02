import test from "node:test";
import assert from "node:assert/strict";

import { Deque } from "../src/index";

test("pushBack and popFront preserve FIFO order", () => {
  const deque = new Deque<number>();
  deque.pushBack(1);
  deque.pushBack(2);
  deque.pushBack(3);
  assert.equal(deque.size, 3);
  assert.equal(deque.popFront(), 1);
  assert.equal(deque.popFront(), 2);
  assert.equal(deque.popFront(), 3);
  assert.equal(deque.size, 0);
  assert.equal(deque.popFront(), undefined);
});

test("pushFront prepends and wraps across the backing storage", () => {
  const deque = new Deque<number>();
  for (let value = 1; value <= 20; value += 1) deque.pushBack(value);
  for (let value = 1; value <= 10; value += 1) {
    assert.equal(deque.popFront(), value);
  }
  deque.pushFront(0);
  deque.pushBack(21);
  assert.equal(deque.size, 12);
  assert.equal(deque.popFront(), 0);
  assert.equal(deque.popFront(), 11);
  for (let value = 12; value <= 21; value += 1) {
    assert.equal(deque.popFront(), value);
  }
  assert.equal(deque.popFront(), undefined);
});

test("growth and compaction keep every live entry in order", () => {
  const deque = new Deque<number>();
  for (let value = 0; value < 1_000; value += 1) deque.pushBack(value);
  for (let value = 0; value < 900; value += 1) {
    assert.equal(deque.popFront(), value);
  }
  for (let value = 1_000; value < 1_100; value += 1) deque.pushBack(value);
  for (let value = 900; value < 1_100; value += 1) {
    assert.equal(deque.popFront(), value);
  }
  assert.equal(deque.size, 0);
});

test("clear drops every entry and reuses the deque", () => {
  const deque = new Deque<string>();
  deque.pushBack("a");
  deque.pushBack("b");
  deque.clear();
  assert.equal(deque.size, 0);
  assert.equal(deque.popFront(), undefined);
  deque.pushBack("c");
  assert.equal(deque.popFront(), "c");
});
