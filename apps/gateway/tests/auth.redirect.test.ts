/**
 * Unit tests for the OAuth callback redirect query merge.
 *
 * A connector round-trip returns to the page it started from. If that page
 * still carries the previous callback's parameters, the redirect must replace
 * them rather than append a duplicate pair.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mergeRedirectQuery } from "../src/routes/auth.plugin";

const ORIGIN = "http://localhost:5173";

test("duplicate callback parameters collapse to one pair", () => {
  const merged = mergeRedirectQuery(
    ORIGIN,
    "/c/thread-1?open_connector=metaAds&meta_connected=true",
    new URLSearchParams("open_connector=metaAds&meta_connected=true"),
  );
  const url = new URL(merged);

  assert.equal(url.pathname, "/c/thread-1");
  assert.deepEqual(url.searchParams.getAll("open_connector"), ["metaAds"]);
  assert.deepEqual(url.searchParams.getAll("meta_connected"), ["true"]);
});

test("unrelated parameters and the hash survive the merge", () => {
  const merged = mergeRedirectQuery(
    ORIGIN,
    "/c/thread-1?debug=1&open_connector=shopify#_=_",
    new URLSearchParams("open_connector=shopify&shopify_connected=true"),
  );
  const url = new URL(merged);

  assert.equal(url.searchParams.get("debug"), "1");
  assert.deepEqual(url.searchParams.getAll("open_connector"), ["shopify"]);
  assert.equal(url.searchParams.get("shopify_connected"), "true");
  assert.equal(url.hash, "#_=_");
});

test("error messages keep their encoding through the merge", () => {
  const message = "Meta Ads failed: permission & token #1";
  const merged = mergeRedirectQuery(ORIGIN, "/c/thread-1", { error: message });
  const url = new URL(merged);

  assert.equal(url.searchParams.get("error"), message);
});

test("a repeated error replaces the stale message instead of stacking", () => {
  const merged = mergeRedirectQuery(
    ORIGIN,
    "/c/thread-1?error=old",
    { error: "new" },
  );
  const url = new URL(merged);

  assert.deepEqual(url.searchParams.getAll("error"), ["new"]);
});
