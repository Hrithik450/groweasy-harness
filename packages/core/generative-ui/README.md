# @openai-harness/generative-ui

The framework-free Generative UI domain: everything about an
assistant-authored UI block except drawing it.

What it owns:
- the `UIBlockNode` and `UIBlockSpec` wire types carried by `ui/block` session
  events and model messages (`src/types.ts`);
- the curated block catalog of component kinds and their prop schemas
  (`src/catalog.ts`);
- structure validation: JSON/nested/flat input normalized to the flat spec and
  every element checked against the catalog (`src/validator.ts`);
- the model-facing submission text built from a block's submitted values
  (`src/submission.ts`);
- pure prompt and field helpers (`src/utils.ts`).

What it does not own:
- React components, the renderer, and the component registry — those stay in
  the application (`src/components/generative.ui/**`);
- the `useNormalizedFieldId` hook, the only React binding, which stays in the
  application-side shim;
- any state or transport.

`src/catalog.ts` imports `@json-render/react/schema`, which is the published
spec schema module. It is framework-free (its chunk imports only
`@json-render/core`); no React runtime is loaded from this package.

The application keeps `src/lib/generative.ui/**` as thin re-export shims so
existing importers compile unchanged. Build output stays flat: `tsdown` emits
`lib/index.js` with `lib/index.d.ts` beside it.

This package has no counterpart in the reference deepseek-harness repository,
so its shape follows that repository's `packages/core/*` conventions rather
than mirroring a reference package.
