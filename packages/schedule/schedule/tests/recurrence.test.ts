import test from "node:test";
import assert from "node:assert/strict";

import { computeNextOccurrence } from "../src/index";

test("minute step advances from the supplied instant and truncates seconds", () => {
  const from = new Date("2026-01-01T10:00:37.250Z");
  assert.equal(
    computeNextOccurrence("*/15 * * * *", from).toISOString(),
    "2026-01-01T10:15:00.000Z",
  );
});

test("minute step without a valid value falls back to fifteen minutes", () => {
  const from = new Date("2026-01-01T10:00:00.000Z");
  assert.equal(
    computeNextOccurrence("*/nope * * * *", from).toISOString(),
    "2026-01-01T10:15:00.000Z",
  );
});

test("hour step fixes the minute and advances wall-clock hours", () => {
  // Interval forms advance local wall-clock time, so assert the shape rather
  // than a UTC instant: minute fixed, seconds cleared, hours advanced by two.
  const from = new Date("2026-01-01T10:42:11.000Z");
  const next = computeNextOccurrence("30 */2 * * *", from);
  assert.equal(next.getMinutes(), 30);
  assert.equal(next.getSeconds(), 0);
  assert.equal((next.getHours() - from.getHours() + 24) % 24, 2);
});

test("daily expression targets the fixed IST wall-clock time", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(
    computeNextOccurrence("0 9 * * *", from).toISOString(),
    "2026-01-01T03:30:00.000Z",
  );
});

test("daily expression already past today rolls to tomorrow", () => {
  const from = new Date("2026-01-01T04:00:00.000Z");
  assert.equal(
    computeNextOccurrence("0 9 * * *", from).toISOString(),
    "2026-01-02T03:30:00.000Z",
  );
});

test("malformed input falls back to one day later at second zero", () => {
  const from = new Date("2026-01-01T10:00:37.250Z");
  assert.equal(
    computeNextOccurrence("not a cron", from).toISOString(),
    "2026-01-02T10:00:00.000Z",
  );
});

test("an empty expression also takes the one-day fallback", () => {
  const from = new Date("2026-01-01T23:59:59.999Z");
  assert.equal(
    computeNextOccurrence("", from).toISOString(),
    "2026-01-02T23:59:00.000Z",
  );
});
