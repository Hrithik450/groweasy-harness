import { resolve } from "node:path";
import { defineConfig } from "tsdown";

/**
 * Build shape for every workspace package without its own `tsdown.config.ts`.
 *
 * The root config builds the whole tree as one workspace, which exceeds the
 * process heap on this repository; `scripts/build-packages.mjs` runs this one
 * package at a time instead. The output must match the package export maps:
 * `lib/index.js` plus `lib/index.d.ts`.
 */
export default defineConfig({
  entry: [resolve(process.cwd(), "src/index.ts")],
  outDir: resolve(process.cwd(), "lib"),
  format: ["esm"],
  platform: "node",
  target: "es2024",
  dts: true,
  clean: true,
  fixedExtension: false,
});
