/**
 * Tool-pairing balance over the model-visible surface.
 *
 * The application session has no rewritable surface object; the current
 * surface is the ordered projection of the durable log. Callers therefore
 * build one {@link ToolPairingEntry} per visible node and price every cut in
 * that order, so a safe cut never splits an assistant tool call from its
 * result. This is the host-independent core the basic strategy folds over.
 *
 * @module @openai-harness/compaction/tool-pairing
 */

/** The pairing-relevant shape of one model-visible surface entry. */
export interface ToolPairingEntry {
  /** Number of assistant tool calls carried by this entry. */
  readonly toolCalls: number;
  /** Whether this entry is a tool result. */
  readonly toolResult: boolean;
}

/**
 * Compute the balance of every surface cut in current order.
 *
 * A surface of N entries has N + 1 cuts; entry `i` is the cut before entry
 * `i` and the final entry is the cut after the surface tail. A cut is
 * balanced when no unanswered tool call crosses it.
 *
 * @param entries - model-visible entries in surface order.
 * @returns one balance value per cut.
 * @throws when a tool result has no preceding open call.
 */
export function toolPairingBalances(
  entries: readonly ToolPairingEntry[],
): number[] {
  const balances = [0];
  let open = 0;
  for (const entry of entries) {
    open += entry.toolCalls;
    if (entry.toolResult) open -= 1;
    if (open < 0) {
      throw new Error(
        "compaction: tool/result has no matching assistant tool call",
      );
    }
    balances.push(open);
  }
  return balances;
}

/**
 * Whether the cut immediately before one surface index is balanced.
 * @param balances - result of {@link toolPairingBalances}.
 * @param index - surface position whose leading cut is checked.
 * @returns true when no unanswered tool call crosses the cut.
 * @throws when the index has no cut.
 */
export function toolPairingBalancedBefore(
  balances: readonly number[],
  index: number,
): boolean {
  const balanced = balances[index];
  if (balanced === undefined) {
    throw new Error(`tool-pairing balance: surface index ${index} not found`);
  }
  return balanced === 0;
}

/**
 * Whether the cut immediately after one surface index is balanced.
 * @param balances - result of {@link toolPairingBalances}.
 * @param index - surface position whose trailing cut is checked.
 * @returns true when no unanswered tool call crosses the cut.
 * @throws when the index has no trailing cut.
 */
export function toolPairingBalancedAfter(
  balances: readonly number[],
  index: number,
): boolean {
  return toolPairingBalancedBefore(balances, index + 1);
}
