import assert from "node:assert/strict";
import test from "node:test";

import {
  toolPairingBalancedAfter,
  toolPairingBalancedBefore,
  toolPairingBalances,
} from "../src/tool-pairing";

test("balances every cut around an assistant tool call and its result", () => {
  const balances = toolPairingBalances([
    { toolCalls: 0, toolResult: false },
    { toolCalls: 1, toolResult: false },
    { toolCalls: 0, toolResult: true },
    { toolCalls: 0, toolResult: false },
  ]);

  assert.deepEqual(balances, [0, 0, 1, 0, 0]);
  assert.equal(toolPairingBalancedBefore(balances, 0), true);
  assert.equal(toolPairingBalancedBefore(balances, 1), true);
  assert.equal(toolPairingBalancedBefore(balances, 2), false);
  assert.equal(toolPairingBalancedAfter(balances, 1), false);
  assert.equal(toolPairingBalancedAfter(balances, 2), true);
});

test("rejects a tool result with no preceding call", () => {
  assert.throws(
    () => toolPairingBalances([{ toolCalls: 0, toolResult: true }]),
    /no matching assistant tool call/,
  );
});

test("rejects a cut outside the surface", () => {
  assert.throws(
    () => toolPairingBalancedBefore([0], 1),
    /surface index 1 not found/,
  );
});
