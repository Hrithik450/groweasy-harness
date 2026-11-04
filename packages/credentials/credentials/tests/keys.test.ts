import test from "node:test";
import assert from "node:assert/strict";

import {
  credentialKey,
  credentialKeyId,
  credentialKeyScope,
  isCredentialKeySegment,
  parseCredentialKey,
} from "../src/keys";

test("credentialKey brands a valid scope and id", () => {
  const key = credentialKey("connectors", "meta-ads");

  assert.equal(key, "connectors/meta-ads");
  assert.equal(credentialKeyScope(key), "connectors");
  assert.equal(credentialKeyId(key), "meta-ads");
});

test("parseCredentialKey round-trips a stored key", () => {
  assert.equal(parseCredentialKey("connectors/shopify"), "connectors/shopify");
});

test("invalid segments are rejected", () => {
  assert.throws(() => credentialKey("Connectors", "meta"), TypeError);
  assert.throws(() => credentialKey("connectors", "meta_ads"), TypeError);
  assert.throws(() => credentialKey("connectors", ""), TypeError);
});

test("parseCredentialKey rejects a key that is not two segments", () => {
  assert.throws(() => parseCredentialKey("connectors"), TypeError);
  assert.throws(() => parseCredentialKey("connectors/meta/ads"), TypeError);
});

test("isCredentialKeySegment answers the grammar without throwing", () => {
  assert.equal(isCredentialKeySegment("meta-ads"), true);
  assert.equal(isCredentialKeySegment("MetaAds"), false);
  assert.equal(isCredentialKeySegment(""), false);
});
