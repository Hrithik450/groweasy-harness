import test from "node:test";
import assert from "node:assert/strict";

import {
  FACEBOOK_RETURN_FRAGMENT,
  OAUTH_RETURN_PARAMS,
  stripFacebookReturnFragment,
  stripQueryParams,
} from "../src/client/lib/utils";

test("stripQueryParams removes every OAuth callback parameter once", () => {
  const result = stripQueryParams(
    "?open_connector=metaAds&meta_connected=true&shopify_connected=true&keep=1",
    OAUTH_RETURN_PARAMS,
  );

  assert.equal(result.removed, true);
  assert.equal(result.search, "keep=1");
});

test("stripQueryParams removes duplicated callback parameters entirely", () => {
  const result = stripQueryParams(
    "?open_connector=metaAds&open_connector=metaAds&meta_connected=true&meta_connected=true&keep=1",
    OAUTH_RETURN_PARAMS,
  );

  assert.equal(result.removed, true);
  assert.equal(result.search, "keep=1");
});

test("stripQueryParams reports no change when nothing matches", () => {
  const result = stripQueryParams("?keep=1", OAUTH_RETURN_PARAMS);

  assert.equal(result.removed, false);
  assert.equal(result.search, "keep=1");
});

test("Facebook's empty return fragment is cleared but real hashes survive", () => {
  assert.equal(stripFacebookReturnFragment(FACEBOOK_RETURN_FRAGMENT), "");
  assert.equal(stripFacebookReturnFragment("#section-2"), "#section-2");
  assert.equal(stripFacebookReturnFragment(""), "");
});
