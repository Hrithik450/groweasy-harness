/**
 * Regenerate `compilerOptions.paths` in `tsconfig.base.json` from the workspace
 * package manifests.
 *
 * The editor and `tsc` resolve `@openai-harness/*` through those aliases while
 * a package's `exports` still point at its built `lib/` output. Deriving the
 * map from disk mirrors the reference repository's rule that a package joins
 * the workspace by existing, not by being registered in a hand-maintained
 * list. The app alias `@/*` is preserved; every other entry is regenerated.
 *
 * Usage: `node scripts/sync-workspace-paths.mjs`
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(root, "tsconfig.base.json");

/** @returns package directories under `packages/<group>/<leaf>`. */
function packageDirs() {
  const groups = readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const dirs = [];
  for (const group of groups) {
    for (const leaf of readdirSync(join(root, "packages", group), {
      withFileTypes: true,
    })) {
      if (!leaf.isDirectory()) continue;
      const dir = posix.join("packages", group, leaf.name);
      if (existsSync(join(root, dir, "package.json"))) dirs.push(dir);
    }
  }
  return dirs;
}

/**
 * Resolve a source entry file for an export subpath.
 * @param dir - package directory.
 * @param sub - subpath without `./`, or empty for the package root.
 * @returns the source path, or `undefined` when no index exists.
 */
function sourceEntry(dir, sub) {
  const base = sub === "" ? "src" : posix.join("src", sub);
  for (const ext of [".ts", ".tsx"]) {
    const candidate = `./${posix.join(dir, base, `index${ext}`)}`;
    if (existsSync(join(root, candidate))) return candidate;
  }
  return undefined;
}

const paths = { "@/*": ["./apps/gateway/src/*"] };
for (const dir of packageDirs()) {
  const manifest = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
  const name = manifest.name;
  if (typeof name !== "string") continue;

  const entry = sourceEntry(dir, "");
  if (entry !== undefined) paths[name] = [entry];

  const exports = manifest.exports ?? {};
  for (const key of Object.keys(exports)) {
    if (key === "." || key === "./package.json") continue;
    if (key === "./src/*") {
      paths[`${name}/src/*`] = [`./${posix.join(dir, "src/*")}`];
      continue;
    }
    if (!key.startsWith("./")) continue;
    const sub = key.slice(2);
    const subEntry = sourceEntry(dir, sub);
    if (subEntry !== undefined) paths[`${name}/${sub}`] = [subEntry];
  }
}

const sorted = {};
for (const key of Object.keys(paths).sort()) sorted[key] = paths[key];
if (sorted["@/*"] !== undefined) {
  delete sorted["@/*"];
}
const finalPaths = { "@/*": ["./apps/gateway/src/*"], ...sorted };

const config = JSON.parse(readFileSync(configPath, "utf8"));
config.compilerOptions.paths = finalPaths;
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`tsconfig.base.json: ${Object.keys(finalPaths).length} path entries`);
