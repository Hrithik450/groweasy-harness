# @openai-harness/util-deque

`Deque<T>`, a circular queue with amortized constant-time insertion and
removal. Removed entries are cleared immediately, and sparse storage shrinks
once the live entry count reaches a quarter of capacity.

What it owns:
- the circular buffer, growth, shrinking, and index wrapping;
- `size`, `pushBack`, `pushFront`, `popFront`, and `clear`.

What it does not own:
- wake-up, cancellation, capacity limits, or overload handling — consumers
  such as the gateway stream inbox and the browser uplink queue decide those;
- retention policy beyond releasing removed entries.

Source reference: `packages/util/deque/src/index.ts` in the reference
deepseek-harness repository. Only the operations this port uses are kept.
