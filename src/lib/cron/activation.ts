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
  ensureDefaultCronJobsByUserId,
  getCronJobsByUserId,
} from "@/lib/repositories/cron.repo";
import { DEFAULT_META_CRON_JOBS } from "@/lib/repositories/defaults";
import { getConnectorByUserIdAndProviderSlug } from "@/lib/repositories/connectors.repo";

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

/**
 * Admit a connector's jobs to the schedule.
 *
 * @param immediate - run on connect (default) instead of waiting for the
 *                    job's next configured occurrence.
 */
export function activateCronJobsForConnector(
  userId: string,
  requires: string,
  immediate = true,
): void {
  activateCronJobsByRequires(userId, requires, immediate);
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

/** The Meta user behind a connection, when the connector stored one. */
export function metaUserId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const userId = (metadata as { userId?: unknown }).userId;
  return typeof userId === "string" && userId ? userId : null;
}

export async function ensureMetaCronSchedule(
  userId: string,
  previousMetaUserId: string | null,
  immediate = true,
): Promise<void> {
  const latest = getConnectorByUserIdAndProviderSlug(userId, "meta");
  const currentMetaUserId = metaUserId(latest?.metadata);
  const jobs = getCronJobsByUserId(userId).filter(
    (job) => job.requires === "metaAds",
  );
  const scheduled =
    jobs.length > 0 && jobs.every((job) => job.status === "active");

  if (
    previousMetaUserId !== null &&
    currentMetaUserId !== null &&
    previousMetaUserId === currentMetaUserId &&
    scheduled
  ) {
    return;
  }

  ensureDefaultCronJobsByUserId(userId, DEFAULT_META_CRON_JOBS);
  activateCronJobsByRequires(userId, "metaAds", immediate);
}
