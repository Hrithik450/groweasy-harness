/**
 * Connector gate for scheduled jobs.
 *
 * A job may exist before its capability does: seeding parks it inactive, and
 * only the connector service may admit it to the schedule. The worker never asks
 * whether a connector is present.
 *
 * @module @/lib/cron/activation
 */

import type { ConnectorStatus } from "@/lib/db";
import {
  activateCronJobsByRequires,
  deactivateCronJobsByRequires,
} from "@/lib/repositories/cron.repo";

/** Connector states that make gated jobs eligible. */
const AVAILABLE: ReadonlySet<ConnectorStatus> = new Set<ConnectorStatus>([
  "connected",
]);

/** Connector states that must park their jobs. */
const UNAVAILABLE: ReadonlySet<ConnectorStatus> = new Set<ConnectorStatus>([
  "running",
  "disconnected",
  "expired",
  "error",
]);

/**
 * Connectors whose "connected" flag lands inside their own agent turn. Their
 * route activates the jobs after that turn settles, so the worker cannot race
 * a second turn onto the same session.
 */
const ACTIVATE_AFTER_TURN: ReadonlySet<string> = new Set(["businessProfile"]);

/** Admit a connector's jobs to the schedule. */
export function activateCronJobsForConnector(
  userId: string,
  requires: string,
): void {
  activateCronJobsByRequires(userId, requires);
}

/**
 * Align jobs gated on `requires` with the connector's current status.
 */
export function syncCronJobsForConnector(
  userId: string,
  requires: string,
  status: ConnectorStatus | null,
): void {
  if (status !== null && AVAILABLE.has(status)) {
    if (!ACTIVATE_AFTER_TURN.has(requires)) {
      activateCronJobsByRequires(userId, requires);
    }
    return;
  }

  if (status === null || UNAVAILABLE.has(status)) {
    deactivateCronJobsByRequires(userId, requires);
  }
}
