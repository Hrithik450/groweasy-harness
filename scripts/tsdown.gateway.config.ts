import { resolve } from "node:path";
import { defineConfig } from "tsdown";

/**
 * One self-contained bundle of the gateway, for a release snapshot.
 *
 * The gateway normally runs from the checkout via `tsx`, which means a deploy
 * cannot be rolled back: the code under `apps/gateway/src` is whatever `HEAD`
 * is. Bundling produces a single file that can be published beside the web
 * bundle and reverted by a symlink flip.
 *
 * Workspace packages are bundled in; npm dependencies stay external and are
 * shared from the checkout's `node_modules`. Without `noExternal` the output
 * would still `import "@openai-harness/…"` at runtime and resolve back to the
 * live checkout, which is exactly what the snapshot exists to avoid.
 */
export default defineConfig({
  entry: [resolve(process.cwd(), "apps/gateway/src/index.ts")],
  outDir: process.env.GATEWAY_OUT_DIR ?? resolve(process.cwd(), "apps/gateway/dist"),
  format: ["esm"],
  platform: "node",
  target: "es2024",
  dts: false,
  clean: true,
  fixedExtension: false,
  noExternal: [/^@openai-harness\//, /^@deepseek-ai\//],
});
