import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * Workspace lint. The Next presets are gone with the Next app; the rules that
 * mattered are kept: TypeScript parsing, and the client/server boundary that
 * stops browser packages from importing server-only modules.
 */
const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase uses `void promise` deliberately for fire-and-forget
      // Cordis effects; do not force every promise to be awaited.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // The reference harness keeps `any` and empty shapes at the dynamic
      // boundaries (projections, registries, tool arguments); these rules are
      // style-only and would be noise here.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-this-alias": "off",
      "no-empty": "off",
      "no-useless-assignment": "off",
      "require-yield": "off",
    },
  },
  // Browser packages must not reach into host-side application modules or
  // Node builtins. Only the browser source entry is checked: packages that are
  // dual (connection, attachment) keep Node-only code beside it, and tests run
  // on Node by design.
  {
    files: ["packages/client/**/src/client/**/*.{ts,tsx}", "apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/*", "@/config/*"],
              message:
                "Browser packages must not import host application modules; depend on a package or accept a binding.",
            },
            {
              group: ["node:*"],
              message:
                "Browser packages must not import Node builtins; move the code or inject it.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    "node_modules/**",
    "vendor/**",
    "**/lib/**",
    "**/dist/**",
    "apps/web/dist/**",
    "data/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
