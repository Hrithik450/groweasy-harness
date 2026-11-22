/**
 * Releases connectors whose scan died without clearing its own state.
 *
 * A scan flips `status` to `running` on start and back to a settled value when it
 * finishes or hits its deadline. A process that is killed mid-scan never runs
 * either reset, which leaves the UI waiting on a run that no longer exists.
 * Readers heal that here instead of trusting the flag.
 *
 * @module @/lib/connectors/sync.reconcile
 */

import type { Connector } from "@/lib/db";
import { deactivateCronJobsByRequires } from "@/lib/repositories";
import { upsertConnector } from "@/lib/repositories/connectors.repo";

/** How long a `running` scan may stay silent before it is presumed dead. */
export const STALE_SYNC_MS = 20 * 60 * 1000;

/**
 * Return the row as the caller should see it, releasing a stale `running`
 * flag on the way. The write is best-effort: a reader must never fail because
 * the repair did.
 *
 * @param row - the stored connector, or `null`/`undefined` when absent.
 * @returns the connector with a stale run already cleared, or the input.
 */
export function reconcileStatus<T extends Connector | null | undefined>(
  row: T,
): T {
  if (!row || row.status !== "running") return row;

  const updatedAt = Date.parse(row.updatedAt);
  const silentSince = Date.now() - (Number.isFinite(updatedAt) ? updatedAt : 0);
  if (silentSince < STALE_SYNC_MS) return row;

  try {
    upsertConnector({
      userId: row.userId,
      slug: row.slug,
      instance: row.instance,
      providerSlug: row.providerSlug,
      status: "error",
    });
    deactivateCronJobsByRequires(row.userId, row.slug);
  } catch (error) {
    console.warn(
      `[Connector] Could not release stale run for ${row.slug}:`,
      error instanceof Error ? error.message : error,
    );
    return row;
  }

  return { ...row, status: "error" as const };
}
