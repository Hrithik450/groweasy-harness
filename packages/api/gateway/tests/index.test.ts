import test from "node:test";
import assert from "node:assert/strict";

import { sessionMember } from "../src/index";

test("dotted contract methods resolve to session service members", () => {
  assert.equal(sessionMember("session.list"), "list");
  assert.equal(sessionMember("session.inspect"), "inspect");
  assert.equal(sessionMember("session.create"), "create");
  assert.equal(sessionMember("session.projection"), "projection");
  assert.equal(sessionMember("detailBar.update"), "detailBar.update");
  assert.equal(sessionMember("session.prompt"), "prompt");
  assert.equal(sessionMember("session.page"), "page");
  assert.equal(sessionMember("session.cancel"), "cancel");
  assert.equal(sessionMember("session.block.submit"), "block.submit");
});

test("methods outside the session namespace are not claimed", () => {
  const loose = (method: string): Parameters<typeof sessionMember>[0] =>
    method as Parameters<typeof sessionMember>[0];
  assert.equal(sessionMember(loose("other.list")), undefined);
  assert.equal(sessionMember(loose("session")), undefined);
  assert.equal(sessionMember(loose("sessionx.list")), undefined);
});
