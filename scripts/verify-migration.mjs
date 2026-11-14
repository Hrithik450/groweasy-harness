/**
 * Prove the package migration is complete.
 *
 * The migration's claim is structural, so the checks are structural: no
 * application-private implementation tree, no package importing the app alias,
 * no ORM left behind, and every workspace package well-formed. Exits non-zero
 * on the first failed category so CI and the final sweep can trust it.
 *
 * Usage: `node scripts/verify-migration.mjs`
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

/**
 * Read every text file under a directory.
 * @param dir - repo-relative directory.
 * @param exts - file extensions to include.
 * @returns `{ path, text }` pairs.
 */
function readTree(dir, exts) {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "lib") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (exts.some((ext) => entry.name.endsWith(ext))) {
        out.push({ path: posix.join(dir, posix.relative(absolute, path)), text: readFileSync(path, "utf8") });
      }
    }
  };
  walk(absolute);
  return out;
}

/** @returns package directories under `packages/<group>/<leaf>`. */
function packageDirs() {
  const dirs = [];
  for (const group of readdirSync(join(root, "packages"), { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const leaf of readdirSync(join(root, "packages", group.name), { withFileTypes: true })) {
      if (!leaf.isDirectory()) continue;
      const dir = posix.join("packages", group.name, leaf.name);
      if (existsSync(join(root, dir, "package.json"))) dirs.push(dir);
    }
  }
  return dirs;
}

// 1. The application-private implementation tree is gone.
if (existsSync(join(root, "apps/gateway/src/lib"))) {
  const count = readTree("apps/gateway/src/lib", [".ts"]).length;
  failures.push(`apps/gateway/src/lib still exists (${count} files) — implementations belong in packages`);
}

// 2. No package or app source imports the application alias.
const appAlias = /from\s+["']@\/lib\//;
for (const file of [...readTree("packages", [".ts", ".tsx"]), ...readTree("apps/gateway/src", [".ts"])]) {
  if (appAlias.test(file.text)) failures.push(`${file.path} imports @/lib`);
}

// 3. No ORM remains.
const ormPattern = /drizzle-orm|better-sqlite3|drizzle-kit/;
for (const file of readTree("packages", [".ts"])) {
  if (ormPattern.test(file.text)) failures.push(`${file.path} still references Drizzle/better-sqlite3`);
}
for (const dir of packageDirs()) {
  const manifest = readFileSync(join(root, dir, "package.json"), "utf8");
  if (ormPattern.test(manifest)) failures.push(`${dir}/package.json declares an ORM dependency`);
}
const rootManifest = readFileSync(join(root, "package.json"), "utf8");
if (ormPattern.test(rootManifest)) failures.push("root package.json declares an ORM dependency");
for (const config of ["drizzle.config.ts", "drizzle.scraper.config.ts"]) {
  if (existsSync(join(root, config))) failures.push(`${config} still exists`);
}

// 4. Every workspace package is well-formed.
for (const dir of packageDirs()) {
  const manifest = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@openai-harness/")) {
    failures.push(`${dir}/package.json has no @openai-harness name`);
  }
  if (manifest.type !== "module") failures.push(`${dir}/package.json is not ESM`);
  if (!existsSync(join(root, dir, "README.md"))) failures.push(`${dir} has no README.md`);
  if (!existsSync(join(root, dir, "src/index.ts")) && !existsSync(join(root, dir, "src/index.tsx"))) {
    failures.push(`${dir} has no src/index`);
  }
  const statements = readTree(dir, [".ts"]).reduce(
    (sum, file) => sum + file.text.split("\n").length,
    0,
  );
  const artifact = statSync(join(root, dir));
  if (!artifact.isDirectory()) failures.push(`${dir} is not a directory`);
  void statements;
}

const packages = packageDirs();
console.log(`packages: ${packages.length}`);
console.log(`app source files: ${readTree("apps/gateway/src", [".ts"]).length}`);
if (failures.length > 0) {
  console.error(`\nFAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("OK: no app-private implementation tree, no app-alias imports in packages, no ORM");
