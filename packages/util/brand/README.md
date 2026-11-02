# @openai-harness/brand

Compile-time-only brands for strings and numbers. `Branded` and
`BrandedNumber` make structurally identical primitives non-interchangeable,
and `brandString` / `brandNumber` apply a brand without changing the value.
The package holds no runtime identity or mutable state, so independently
installed copies produce interchangeable values.

What it owns:
- the `Branded` and `BrandedNumber` type constructors;
- `brandString` and `brandNumber`.

What it does not own:
- concrete domain brands — `SessionId`, `AttachmentId`, `MessageId`, and the
  rest live with the packages that define those values;
- value validation — callers admit a value before branding it.

Source reference: `packages/util/brand/src/index.ts` in the reference
deepseek-harness repository.
