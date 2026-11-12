---
description: "Generative UI block renderer and component registry, registered into the chat message-node slot."
kind: "package-reference"
---

# @openai-harness/client-ui-generative

## Summary

The app's Generative UI renderer (`src/components/generative.ui/**`), moved
into a client package with its markup, registry, and chart palette unchanged.
It draws assistant-authored block specs through `@json-render/react` and the
curated component catalog.

It contributes one slot entry, `conversation.chat.generative-ui` (single,
`session-maybe`), a thin adapter from the chat node owner props to
`GenerativeUIRenderer`. A chat owner declares that seat as a child slot; the
plugin waits for the declaration with `ctx.slots.inject`.

## Public surface

- `./client` — `apply(ctx)`, `GENERATIVE_UI_SLOT`, `GenerativeUINode` and its
  owner props.
- `GenerativeUIRenderer` / `GenerativeUIContext` — the unchanged renderer,
  error boundary, and interactive value plumbing.
- `registry` / `GenerativeUIContainerContext` — the unchanged block component
  registry and container context.
- `useNormalizedFieldId` — the `useId` half of field-id composition (the pure
  helper stays in `@openai-harness/generative-ui`).
- Re-export of `@openai-harness/generative-ui` domain types, catalog,
  validators, and helpers for importers that previously used
  `@/lib/generative.ui`.

## Boundaries

- Domain types and validators come from `@openai-harness/generative-ui`; the
  package never imports `@/lib`, `@/components`, or the app store.
- Image, video, and audio block components come from
  `@openai-harness/client-ui-attachment-viewers/client`, so the viewers have a
  single implementation.
- The slot name is deliberately different from a potential chat-owned
  `conversation.chat.node` keyed slot: this package owns only its message-node
  seat and does not claim the chat node contract.
