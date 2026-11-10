import { defineConfig } from "tsdown";

/**
 * Flat browser emit: `lib/index.js` (host no-op) and `lib/client.js` (the
 * Cordis plugin plus Settings, New Session, and the image lightbox).
 * Declarations land beside the bundles so the package export map stays flat
 * like the other client packages.
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
