import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const clientDir = new URL("../src/client/", import.meta.url);

function sourceFiles(dir: URL): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.(ts|tsx)$/.test(entry.name) ? [child.pathname] : [];
  });
}

test("landing registers the screen into the root slot", () => {
  const index = readFileSync(new URL("index.tsx", clientDir), "utf8");
  assert.match(index, /name: "root"/);
  assert.match(index, /export const inject = \["slots"\]/);
});

test("landing screen projects its title without Next.js metadata", () => {
  const page = readFileSync(new URL("landing-page.tsx", clientDir), "utf8");
  assert.match(page, /document\.title = LANDING_TITLE/);
  assert.match(page, /LANDING_TITLE = "Uno — AI that finds winning ads"/);
  assert.doesNotMatch(page, /metadata/);
  assert.doesNotMatch(page, /next\/font/);
});

test("landing package imports no app or Next.js modules", () => {
  const forbidden = [
    /from\s+"next\//,
    /from\s+'next\//,
    /from\s+"@\/components\//,
    /from\s+'@\/components\//,
    /from\s+"@\/lib\//,
    /from\s+'@\/lib\//,
    /from\s+"@\/store\//,
    /from\s+'@\/store\//,
  ];
  for (const file of sourceFiles(clientDir)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} matches ${pattern}`);
    }
  }
});

test("landing component tree is present", () => {
  for (const name of [
    "header.tsx",
    "hero.tsx",
    "ad-set.tsx",
    "ticker.tsx",
    "footer.tsx",
  ]) {
    assert.ok(readdirSync(clientDir).includes(name), `missing ${join("client", name)}`);
  }
});
