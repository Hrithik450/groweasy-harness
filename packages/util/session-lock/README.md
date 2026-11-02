# @openai-harness/session-lock

An in-process FIFO mutex keyed by session id. Waiters queue and receive the
lock one at a time, so concurrent turns for one session cannot overlap; waiting
is abortable through an `AbortSignal` and bounded by a timeout that rejects
with `SessionBusyError`. Release is idempotent and cannot free the next holder.
Scope is one Node process, so a multi-instance deployment needs a distributed
lease or per-session job queue instead.

Source reference: ported from `apps/gateway/src/lib/utils/session-lock.ts`.
