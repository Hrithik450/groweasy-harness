import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type TsdownPlugin } from "tsdown";

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own CSS pipeline
 * (which needs `@tsdown/css`). The id deliberately does not end in `.css`.
 */
const CSS_MODULE_PREFIX = "\0ui-landing-css:";

function toPath(id: string): string {
  return id.startsWith("file:") ? fileURLToPath(id) : id;
}

/**
 * Compile `*.module.css` imports into a hashed class map plus one injected
 * `<style>` row. This is the small local equivalent of the reference
 * harness's client CSS loader and keeps the package build self-contained.
 */
function cssModules(): TsdownPlugin {
  return {
    name: "ui-landing-css-modules",
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith(".module.css")) return null;
      const base = importer === undefined ? process.cwd() : dirname(toPath(importer));
      const file = isAbsolute(source) ? source : resolve(base, source);
      // Strip the extension from the virtual id: tsdown's CSS plugin keys off
      // `.css` anywhere in the id and would try to parse this JS module.
      return CSS_MODULE_PREFIX + encodeURIComponent(file.replace(/\.css$/, ""));
    },
    async load(id: string) {
      if (!id.startsWith(CSS_MODULE_PREFIX)) return null;
      const file = `${decodeURIComponent(id.slice(CSS_MODULE_PREFIX.length))}.css`;
      const classes = new Map<string, string>();
      const scoped = (await readFile(file, "utf8")).replace(
        /\.([A-Za-z_][\w-]*)/g,
        (_match, name: string) => {
          let hashed = classes.get(name);
          if (hashed === undefined) {
            hashed = `${name}-${createHash("sha256")
              .update(`${file}:${name}`)
              .digest("hex")
              .slice(0, 6)}`;
            classes.set(name, hashed);
          }
          return `.${hashed}`;
        },
      );
      const marker = `ui-landing-css:${file}`;
      const code = `
const css = ${JSON.stringify(scoped)};
const marker = ${JSON.stringify(marker)};
if (typeof document !== "undefined" && document.querySelector('style[data-ui-landing-css="' + marker + '"]') === null) {
  const style = document.createElement("style");
  style.setAttribute("data-ui-landing-css", marker);
  style.textContent = css;
  document.head.appendChild(style);
}
export default ${JSON.stringify(Object.fromEntries(classes))};
`;
      return { code, moduleType: "js" };
    },
  };
}

/**
 * Flat browser bundle: `lib/index.js` (host no-op) and `lib/client.js` (the
 * Cordis client plugin). Declarations land beside the bundles so the package
 * export map stays flat like the other client packages.
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
  plugins: [cssModules()],
});
