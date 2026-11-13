import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Resolve one repository path from this config file's directory. */
const sourcePath = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Browser packages that are consumed from source rather than a built `lib/`.
 *
 * `pnpm build:lib` bundles the transport, session, and data packages, but the
 * renderer/layout/theme/page packages ship no build output. Vite has no
 * `tsconfig` paths support, so the shell maps those exact specifiers to their
 * source entries; built packages keep resolving through their `lib/` exports.
 */
const SOURCE_PACKAGES: ReadonlyArray<readonly [specifier: string, entry: string]> = [
  ["@openai-harness/client-web", "../../packages/client/web/src/index.ts"],
  [
    "@openai-harness/api-gateway/client",
    "../../packages/api/gateway/src/client/index.ts",
  ],
  [
    "@openai-harness/session-controller/client",
    "../../packages/api/session-controller/src/client/index.ts",
  ],
  [
    "@openai-harness/client-connection/client",
    "../../packages/client/connection/src/client/index.ts",
  ],
  // The bare specifier resolves to the Node entry (`node:crypto`); browser
  // bundles must get the client half instead.
  [
    "@openai-harness/client-connection",
    "../../packages/client/connection/src/client/index.ts",
  ],
  // The default entry carries the Node attachment store (`node:buffer`);
  // projections only need the reference vocabulary and guards.
  [
    "@openai-harness/attachment",
    "../../packages/attachment/attachment/src/client/index.ts",
  ],
  [
    "@openai-harness/client-ui-connectors/client",
    "../../packages/client/ui-connectors/src/client/index.tsx",
  ],
  [
    "@openai-harness/client-ui-detail-bar/client",
    "../../packages/client/ui-detail-bar/src/client/index.tsx",
  ],
  [
    "@openai-harness/client-ui-detail-bar",
    "../../packages/client/ui-detail-bar/src/index.ts",
  ],
  [
    "@openai-harness/client-ui-connectors",
    "../../packages/client/ui-connectors/src/index.ts",
  ],
  [
    "@openai-harness/client-ui-generative/client",
    "../../packages/client/ui-generative/src/client/index.ts",
  ],
  [
    "@openai-harness/client-ui-renderer/client",
    "../../packages/client/ui-renderer/src/client/index.tsx",
  ],
  [
    "@openai-harness/client-ui-renderer",
    "../../packages/client/ui-renderer/src/index.ts",
  ],
  ["@openai-harness/client-ui-slots", "../../packages/client/ui-slots/src/index.ts"],
  [
    "@openai-harness/client-ui-layout/client",
    "../../packages/client/ui-layout/src/client/index.tsx",
  ],
  ["@openai-harness/client-ui-layout", "../../packages/client/ui-layout/src/index.ts"],
  [
    "@openai-harness/client-ui-primitives",
    "../../packages/client/ui-primitives/src/index.ts",
  ],
  ["@openai-harness/client-ui-theme", "../../packages/client/ui-theme/src/index.ts"],
  [
    "@openai-harness/client-ui-landing/client",
    "../../packages/client/ui-landing/src/client/index.tsx",
  ],
  [
    "@openai-harness/client-ui-landing",
    "../../packages/client/ui-landing/src/index.ts",
  ],
  [
    "@openai-harness/client-ui-profile/client",
    "../../packages/client/ui-profile/src/client/index.tsx",
  ],
  [
    "@openai-harness/client-ui-profile",
    "../../packages/client/ui-profile/src/index.ts",
  ],
];

const sourceAliases = SOURCE_PACKAGES.map(([specifier, entry]) => ({
  find: new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  replacement: sourcePath(entry),
}));

/** Node builtins the browser-safe projection path touches. */
const nodeShims = [{ find: /^node:crypto$/, replacement: sourcePath("./src/shims/node-crypto.ts") }];

/**
 * Thin Vite shell. Relative asset URLs so the built page mounts under any
 * base directory; `dedupe` keeps one instance per shared npm identity (a
 * bare specifier otherwise resolves from the importer's directory and can
 * ship a second React, splitting hook and element identity).
 *
 * `PUBLIC_BASE` overrides the base for deployments that serve client routes
 * such as `/c/<threadId>`. Relative URLs resolve against the *current*
 * directory, so a refresh on `/c/<id>` requests `/c/assets/…`, which a
 * history-fallback server answers with `index.html` — HTML where the browser
 * expects JavaScript, and a blank page.
 */
export default defineConfig({
  base: process.env.PUBLIC_BASE?.trim() || "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [...sourceAliases, ...nodeShims],
    dedupe: ["react", "react-dom"],
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  /**
   * Same-origin `/api` in development. The application routes live on the
   * Gateway; proxying keeps every ported component's relative
   * `/api/...` URL (uploads, download, connectors, auth) working without a
   * build-time origin baked into each package. A deployed build serves the
   * bundle from the Gateway origin, so the same paths resolve there.
   */
  server: {
    proxy: {
      "/api": {
        target: process.env.GATEWAY_ORIGIN ?? "http://127.0.0.1:4000",
        changeOrigin: false,
        ws: true,
      },
    },
  },
});
