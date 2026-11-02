# @openai-harness/util-values

Lossless JSON value vocabulary shared by tool, session, and wire contracts:
`JsonValue` plus the primitive, object, and array predicates. The package also
carries the small stateless string helpers `sanitizeUserId`, which reduces a
user identifier to filesystem-safe characters, and `slugToTitle`, which turns a
camelCase slug into a display title. Neither helper reads storage or ambient
configuration.

Source reference: `packages/util/values/src/index.ts` in the reference
deepseek-harness repository; the string helpers are ported from
`apps/gateway/src/lib/utils/utils.ts`.
