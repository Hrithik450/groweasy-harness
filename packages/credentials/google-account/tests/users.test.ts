import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UserStore } from "../src/user-store";
import {
  getOrCreateAnonymousUser,
  rebindUserWithGoogle,
} from "../src/users";
import { isValidUuidV7 } from "@openai-harness/uuid";

function withStore(run: (store: UserStore) => void): void {
  const root = mkdtempSync(join(tmpdir(), "google-account-users-"));
  try {
    run(new UserStore(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const ANONYMOUS_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

test("an anonymous user is created once for the client's UUIDv7", () => {
  withStore((store) => {
    const created = getOrCreateAnonymousUser(ANONYMOUS_ID, store);
    assert.equal(created.success, true);
    assert.equal(created.data?.id, ANONYMOUS_ID);
    assert.equal(created.data?.googleId, null);
    assert.equal(created.data?.name, "Anonymous");
    assert.equal(created.data?.emailVerified, false);
    assert.equal(store.getUserById(ANONYMOUS_ID)?.id, ANONYMOUS_ID);

    const again = getOrCreateAnonymousUser(ANONYMOUS_ID, store);
    assert.equal(again.data?.createdAt, created.data?.createdAt);
  });
});

test("an invalid preferred id is replaced by a freshly minted UUIDv7", () => {
  withStore((store) => {
    const created = getOrCreateAnonymousUser("not-a-uuid", store);
    assert.equal(created.success, true);
    assert.equal(isValidUuidV7(created.data?.id ?? ""), true);
    assert.notEqual(created.data?.id, "not-a-uuid");
    assert.notEqual(store.getUserById(created.data?.id ?? ""), undefined);
  });
});

test("Google sign-in rebinds the anonymous record in place", () => {
  withStore((store) => {
    const anonymous = getOrCreateAnonymousUser(ANONYMOUS_ID, store);
    assert.equal(anonymous.success, true);

    const rebound = rebindUserWithGoogle(
      {
        id: ANONYMOUS_ID,
        googleId: "google-sub-1",
        email: "user@example.test",
        name: "Real Name",
        picture: "https://example.test/avatar.png",
        emailVerified: true,
      },
      store,
    );

    assert.equal(rebound.success, true);
    assert.equal(rebound.data?.id, ANONYMOUS_ID);
    assert.equal(rebound.data?.googleId, "google-sub-1");
    assert.equal(rebound.data?.email, "user@example.test");
    assert.equal(rebound.data?.name, "Real Name");
    // The same tenant directory and index pointer now resolve to it.
    assert.equal(store.getUserById(ANONYMOUS_ID)?.googleId, "google-sub-1");
    assert.equal(store.getUserByGoogleSub("google-sub-1")?.id, ANONYMOUS_ID);
  });
});

test("an existing Google subject returns its own user, not the anonymous one", () => {
  withStore((store) => {
    const first = getOrCreateAnonymousUser(ANONYMOUS_ID, store);
    assert.equal(first.success, true);
    rebindUserWithGoogle(
      {
        id: ANONYMOUS_ID,
        googleId: "google-sub-1",
        email: "user@example.test",
        name: "Real Name",
        picture: null,
        emailVerified: true,
      },
      store,
    );

    const secondId = "01a1b2c3-d4e5-7f60-8a1b-2c3d4e5f6a7b";
    getOrCreateAnonymousUser(secondId, store);
    const second = rebindUserWithGoogle(
      {
        id: secondId,
        googleId: "google-sub-1",
        email: "user@example.test",
        name: "Real Name",
        picture: null,
        emailVerified: true,
      },
      store,
    );

    assert.equal(second.success, true);
    assert.equal(second.data?.id, ANONYMOUS_ID);
    // The second anonymous record stays a separate tenant.
    assert.equal(store.getUserById(secondId)?.googleId, null);
  });
});
