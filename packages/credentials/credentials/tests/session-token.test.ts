import test from "node:test";
import assert from "node:assert/strict";

import { SessionTokens } from "../src/session-token";

const user = { id: "user-1", email: "user@example.com", emailVerified: true };

test("a signed token verifies back to the same user", async () => {
  const tokens = new SessionTokens({ secret: "test-secret" });
  const token = await tokens.sign(user);

  assert.equal(typeof token, "string");
  assert.deepEqual(await tokens.verify(token), user);
});

test("a token signed with another secret does not verify", async () => {
  const issuer = new SessionTokens({ secret: "secret-a" });
  const verifier = new SessionTokens({ secret: "secret-b" });

  assert.equal(await verifier.verify(await issuer.sign(user)), null);
});

test("a tampered token does not verify", async () => {
  const tokens = new SessionTokens({ secret: "test-secret" });
  const token = await tokens.sign(user);
  const tampered = `${token.slice(0, -2)}xx`;

  assert.equal(await tokens.verify(tampered), null);
});

test("an expired token does not verify", async () => {
  const tokens = new SessionTokens({ secret: "test-secret", expiresIn: -1 });

  assert.equal(await tokens.verify(await tokens.sign(user)), null);
});

test("a payload without a user id does not verify", async () => {
  const tokens = new SessionTokens({ secret: "test-secret" });
  const token = await tokens.sign({ id: "" });

  assert.equal(await tokens.verify(token), null);
});

test("an empty secret is rejected at construction", () => {
  assert.throws(() => new SessionTokens({ secret: "" }), TypeError);
});
