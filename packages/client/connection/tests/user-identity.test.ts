import test from "node:test";
import assert from "node:assert/strict";

import {
  adoptClientUserId,
  getClientUserId,
  peekClientUserId,
  persistClientUserId,
  USER_ID_STORAGE_KEY,
} from "../src/client/user-identity";
import { isUuidV7, USER_ID_COOKIE_NAME } from "../src/user-id";

/** Minimal `localStorage` double; `fail` simulates blocked storage. */
function installStorage(fail = false): Map<string, string> {
  const data = new Map<string, string>();
  const storage = {
    getItem(key: string): string | null {
      if (fail) throw new Error("storage blocked");
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (fail) throw new Error("storage blocked");
      data.set(key, value);
    },
    removeItem(key: string): void {
      data.delete(key);
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return data;
}

/** Minimal `document.cookie` jar double. */
function installDocument(initial = ""): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of initial.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name && value) jar.set(name, value);
  }
  const document = {
    get cookie(): string {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(raw: string) {
      const pair = raw.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator < 0) return;
      jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: document,
  });
  return jar;
}

function uninstall(): void {
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "document");
}

test("the first call mints a UUIDv7 and persists it to both carriers", () => {
  const stored = installStorage();
  const jar = installDocument();
  try {
    assert.equal(peekClientUserId(), undefined);
    const id = getClientUserId();
    assert.equal(isUuidV7(id), true);
    assert.equal(stored.get(USER_ID_STORAGE_KEY), id);
    assert.equal(jar.get(USER_ID_COOKIE_NAME), id);
    assert.equal(getClientUserId(), id);
  } finally {
    uninstall();
  }
});

test("a cookie-only identity is adopted into localStorage", () => {
  const stored = installStorage();
  installDocument(
    `${USER_ID_COOKIE_NAME}=0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b`,
  );
  try {
    const id = getClientUserId();
    assert.equal(id, "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b");
    assert.equal(stored.get(USER_ID_STORAGE_KEY), id);
  } finally {
    uninstall();
  }
});

test("blocked localStorage still yields and persists a cookie identity", () => {
  installStorage(true);
  const jar = installDocument();
  try {
    const id = getClientUserId();
    assert.equal(isUuidV7(id), true);
    assert.equal(jar.get(USER_ID_COOKIE_NAME), id);
    // A poisoned localStorage value is ignored, not trusted.
    assert.equal(peekClientUserId(), id);
  } finally {
    uninstall();
  }
});

test("persist refuses values that are not UUIDv7", () => {
  const stored = installStorage();
  const jar = installDocument();
  try {
    persistClientUserId("not-an-id");
    persistClientUserId("018f2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d");
    assert.equal(stored.size, 0);
    assert.equal(jar.size, 0);
  } finally {
    uninstall();
  }
});

test("adoption stores a server-resolved id only when the client has none", () => {
  const stored = installStorage();
  const jar = installDocument();
  try {
    const serverId = "01a1b2c3-d4e5-7f60-8a1b-2c3d4e5f6a7b";
    adoptClientUserId(serverId);
    assert.equal(peekClientUserId(), serverId);
    assert.equal(stored.get(USER_ID_STORAGE_KEY), serverId);
    assert.equal(jar.get(USER_ID_COOKIE_NAME), serverId);

    const localId = getClientUserId();
    const other = "018f2c3d-4e5f-7a6b-8c9d-0e1f2a3b4c5d";
    adoptClientUserId(other);
    assert.equal(getClientUserId(), localId);

    adoptClientUserId("garbage");
    assert.equal(getClientUserId(), localId);
  } finally {
    uninstall();
  }
});
