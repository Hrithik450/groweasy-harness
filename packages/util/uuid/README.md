# @openai-harness/uuid

Mints and verifies RFC 9562 v4 and v7 UUIDs from `crypto.getRandomValues`, the
random primitive available in browsers, workers, and Node, so callers work in
insecure origins where `crypto.randomUUID` is withheld. `uuidv7` orders
lexicographically by creation time, `bytesToBase64` encodes byte arrays in
bounded chunks, and the predicates recognize both the general UUID and v7
shapes. The package is stateless and depends on no Node-only APIs.

Source reference: ported from `apps/gateway/src/lib/utils/uuid.ts`; the
reference deepseek-harness repository keeps the same implementation in
`packages/util/crypto`.
