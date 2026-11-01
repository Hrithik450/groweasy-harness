# Vendored Packages

Source copies of the Cordis framework and its foundation libraries, taken from the
reference deepseek-harness repository (`/Users/hruthikm/Programming/deepseek-harness/vendor`)
so this harness owns its framework layer. They are byte-identical to the reference except
for the entries logged below.

| Directory | Package | Version |
|---|---|---|
| `cordis/` | `@deepseek-ai/cordis` | 4.0.5 |
| `cosmokit/` | `@deepseek-ai/cosmokit` | 1.8.6 |
| `schemastery/` | `@deepseek-ai/schemastery` | 3.18.5 |

The reference also vendors `loader`, `include`, `hmr`, `timer`, `group` and
`logger-console`. Those belong to the plugin tier, which this harness deliberately
does not carry, so they are absent.

## Local modifications

Keep this log exhaustive — every divergence from the reference copy must be listed.

1. **`cordis/package.json`**: removed the `peerDependencies` and `peerDependenciesMeta`
   entries for `@deepseek-ai/cordis-plugin-include` and `@deepseek-ai/cordis-plugin-loader`.
   Those optional peers name plugin packages that only the reference's plugin tier
   provides; with that tier intentionally absent, `workspace:~` cannot resolve and
   `pnpm install` refuses the workspace. Nothing in the vendored core imports either
   plugin. Source, build output and every other field are unchanged.

2. **`{cordis,cosmokit,schemastery}/tsconfig.json`**: added `noEmit: true` and
   `allowImportingTsExtensions: true`, and removed the project `references`.
   The reference repository builds vendor packages with `tsc -b` from a base config
   carrying `composite`, and its sources use explicit `.ts` specifiers. This
   repository ships the prebuilt `lib/` and never compiles vendor sources, so the
   projects are type-check-only here: without those two flags the editor reports
   TS5097 on every `.ts` specifier, and the references demand `composite` in
   projects that cannot emit. Source, build output and every other field are
   unchanged.
