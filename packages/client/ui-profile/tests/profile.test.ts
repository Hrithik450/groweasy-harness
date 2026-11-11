import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  apply,
  inject,
  PROFILE_PANEL_ID,
  PROFILE_TITLE,
  ProfilePage,
} from "../src/client/index";

interface Registration {
  options: { name: string; key?: string };
  component: unknown;
}

test("profile waits for main and registers the keyed route entry", () => {
  const registrations: Registration[] = [];
  let injectedKey: string | undefined;
  const ctx = {
    slots: {
      inject(key: string, callback: () => () => void) {
        injectedKey = key;
        callback();
        return () => {};
      },
      register(
        options: Registration["options"],
        component: unknown,
      ) {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };

  apply(ctx as never);

  assert.deepEqual(inject, ["slots"]);
  assert.equal(PROFILE_PANEL_ID, "profile");
  assert.equal(injectedKey, "main");
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0]?.options.name, "main");
  assert.equal(registrations[0]?.options.key, PROFILE_PANEL_ID);
  assert.equal(registrations[0]?.component, ProfilePage);
});

test("profile screen projects its title without Next.js metadata", () => {
  const page = readFileSync(
    new URL("../src/client/profile-page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(PROFILE_TITLE, "Uno — Business profile");
  assert.match(page, /document\.title = PROFILE_TITLE/);
  assert.doesNotMatch(page, /metadata/);
  assert.doesNotMatch(page, /next\/font/);
  assert.doesNotMatch(page, /syne\.variable/);
});
