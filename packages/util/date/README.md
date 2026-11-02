# @openai-harness/date

Formats any timestamp — a `Date`, ISO 8601 or relative text such as
`Today · 10:15 AM`, or an epoch in milliseconds or seconds — into the Ad
Manager display shape `Nov 7, 2026 · 3:15 PM`. Already-structured strings pass
through unchanged, and an invalid or missing value falls back to the current
time. The package is stateless and reads no clock beyond `new Date()`.

Source reference: ported from `apps/gateway/src/lib/utils/date.ts`.
