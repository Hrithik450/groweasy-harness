import { globSync } from "node:fs";
import { posix } from "node:path";
import { defineConfig } from "tsdown";

/**
 * Every workspace member is discovered from disk.
 *
 * The reference repository derives its workspace list the same way
 * (`scripts/workspace-package-globs.ts` over every package manifest under
 * `packages/<group>/<leaf>`), so a new package joins the build by existing,
 * not by being registered here. The gateway is deliberately absent: it is the
 * application composition root, not a published package.
 * @returns repo-relative package directories with forward slashes.
 */
function workspacePackages(): string[] {
  return globSync(["vendor/*/package.json", "packages/*/*/package.json"], {
    cwd: import.meta.dirname,
  }).map((manifest) => posix.dirname(manifest.replaceAll("\\", "/")));
}

export default defineConfig({
  workspace: workspacePackages(),
  entry: ["src/index.ts"],
  outDir: "lib",
  format: ["esm"],
  platform: "node",
  target: "es2024",
  dts: true,
  clean: true,
  fixedExtension: false,
});
