# @openai-harness/crypto

Compatibility entry point for the repository's zero-dependency crypto helpers.
It re-exports the UUID minting and verification surface from
`@openai-harness/uuid`, keeping the `crypto` module name available to callers
that imported it before the utility split. The package is stateless and adds no
behavior of its own.

Source reference: `packages/util/crypto/src/index.ts` in the reference
deepseek-harness repository owns the UUID implementation directly; this port
keeps the implementation in `@openai-harness/uuid` and preserves `crypto` as
the stable re-export.
