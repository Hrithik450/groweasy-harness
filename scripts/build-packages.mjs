/**
 * Build every workspace package with one process per package.
 *
 * `tsdown`'s workspace mode builds the whole tree in a single process, which
 * runs out of heap on this repository's 85 packages. Building each package in
 * its own process gives the same output with a bounded heap, and packages that
 * ship their own `tsdown.config.ts` keep using it.
 *
 * Usage: `node scripts/build-packages.mjs`
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

/** Every directory holding a workspace package manifest. */
function packageDirs() {
  const dirs = [];
  for (const group of ["vendor", "packages"]) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const leaf of readdirSync(groupDir, { withFileTypes: true })) {
      if (!leaf.isDirectory()) continue;
      if (group === "vendor") {
        if (existsSync(join(groupDir, leaf.name, "package.json"))) {
          dirs.push(join(groupDir, leaf.name));
        }
        continue;
      }
      for (const member of readdirSync(join(groupDir, leaf.name), {
        withFileTypes: true,
      })) {
        const dir = join(groupDir, leaf.name, member.name);
        if (member.isDirectory() && existsSync(join(dir, "package.json"))) {
          dirs.push(dir);
        }
      }
    }
  }
  return dirs;
}

const defaultConfig = join(root, "scripts", "tsdown.package.config.ts");
const failures = [];

/**
 * Vendored Cordis declares part of `Context` through
 * `declare module './context.ts'` augmentations. A bundled `index.d.ts` keeps
 * those blocks pointing at a file that no longer exists beside it, so the
 * members they add (`plugin`, `effect`, `provide`, …) disappear. Emit the
 * unbundled declaration tree with `tsc` instead, exactly as the package's
 * `types` field expects; tsdown still produces the runtime bundle.
 */
function emitCordisTypes(dir) {
  const result = spawnSync("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], {
    cwd: dir,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
  });
  if (result.status !== 0) failures.push(`${join(dir, "lib/types")} (tsc declarations)`);
}

for (const dir of packageDirs()) {
  const hasOwnConfig = existsSync(join(dir, "tsdown.config.ts"));
  const args = hasOwnConfig
    ? ["tsdown"]
    : ["tsdown", "-c", defaultConfig];
  const result = spawnSync("pnpm", ["exec", ...args], {
    cwd: dir,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
  });
  if (result.status !== 0) failures.push(dir);
  // After tsdown, whose `clean` wipes `lib/` including the declaration tree.
  if (dir === join(root, "vendor", "cordis")) emitCordisTypes(dir);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} package build(s) failed:`);
  for (const dir of failures) console.error(`- ${dir.slice(root.length + 1)}`);
  process.exit(1);
}
