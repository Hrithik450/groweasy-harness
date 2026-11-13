# @openai-harness/web

Thin Vite shell for the browser client. It has no product UI: `src/main.ts`
imports the theme entry, constructs `AppWebEntry` against `#root`, and runs
it. The root slot renders empty until a layout package registers into it.

```sh
pnpm --filter @openai-harness/web dev
pnpm --filter @openai-harness/web build
```

`vite.config.ts` is deliberately small: React plugin, Tailwind's Vite plugin
(the token sheet is a Tailwind v4 `@theme` file), `base: './'`, one React
instance via `resolve.dedupe`, and an es2022 build target. No boot manifest,
module loader, browser downloads, or test tooling is wired here.
