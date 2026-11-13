import { defineConfig } from "tsdown";

/**
 * Flat browser emit: `lib/index.js` for the host-safe type/helper entry and
 * `lib/client.js` for the Cordis plugin and its components. Matches the
 * package's `exports` table so hosts never import a nested `client/index`
 * module.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client/index.tsx",
  },
  outDir: "lib",
  format: ["esm"],
  platform: "browser",
  target: "es2022",
  dts: true,
  clean: true,
  fixedExtension: false,
});
