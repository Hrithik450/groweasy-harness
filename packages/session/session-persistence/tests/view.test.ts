import assert from "node:assert/strict";
import test from "node:test";
import { sessionViewSchema } from "../src/view.contracts";
import type { SessionRecord } from "../src/types";
import { toSessionView } from "../src/view";

const row: SessionRecord = {
  id: "session-1",
  userId: "user-1",
  title: "Ad Manager",
  slug: "adManager",
  hidden: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

test("toSessionView maps a stored row to the wire shape", () => {
  assert.deepEqual(toSessionView(row), {
    id: "session-1",
    userId: "user-1",
    title: "Ad Manager",
    slug: "adManager",
    hidden: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });
});

test("toSessionView normalizes nullable slug", () => {
  const view = toSessionView({
    ...row,
    slug: null,
  });

  assert.equal(view.slug, null);
});

test("sessionViewSchema admits the wire shape", () => {
  const parsed = sessionViewSchema.parse({
    id: "session-1",
    userId: "user-1",
    title: "Ad Manager",
    slug: null,
    hidden: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });

  assert.equal(parsed.hidden, true);
});

test("sessionViewSchema preserves unknown passthrough keys", () => {
  const parsed = sessionViewSchema.parse({
    ...toSessionView(row),
    futureField: "kept",
  }) as unknown as Record<string, unknown>;

  assert.equal(parsed.futureField, "kept");
});
