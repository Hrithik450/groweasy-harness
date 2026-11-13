import test from "node:test";
import assert from "node:assert/strict";
import { SESSION_SLUGS } from "../src/constants";
import { resolveDetailBarType } from "../src/utils";
import type { SessionView } from "@openai-harness/session";

const REGISTERED_KEYS = new Set([
  ...SESSION_SLUGS,
  "default",
]);

function view(partial: Partial<SessionView>): SessionView {
  return {
    id: "s1",
    userId: "u1",
    title: "Session",
    slug: null,
    hidden: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("resolveDetailBarType prefers the slug", () => {
  assert.equal(
    resolveDetailBarType(view({ slug: "adManager" }), "adStrategist"),
    "adManager",
  );
});

test("resolveDetailBarType falls back to the projected detailBar type", () => {
  assert.equal(
    resolveDetailBarType(view({ slug: null }), "adStrategist"),
    "adStrategist",
  );
});

test("resolveDetailBarType defaults to 'default'", () => {
  assert.equal(resolveDetailBarType(view({ slug: null })), "default");
});

test("every session slug is a documented registry key", () => {
  for (const slug of SESSION_SLUGS) {
    assert.ok(REGISTERED_KEYS.has(slug), `missing registry key for ${slug}`);
  }
});
