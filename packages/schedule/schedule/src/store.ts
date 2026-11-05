/**
 * Host-owned bindings for the schedule service.
 *
 * The durable job table is owned by {@link scheduleDomain} and opened through
 * `ctx.storageDomain` by {@link ScheduleService}; this module only carries the
 * pieces the package cannot own:
 *
 * - the id minter and optional user-id normalizer (application identity);
 * - the prompt-delivery callback (application workflows and sessions);
 * - the session-slug lookup used by the default-job seed helper (application
 *   session records).
 *
 * It also holds the process-wide repository binding used by the free-function
 * API and {@link getScheduleManager}, mirroring the scraper package's
 * `configureScraperRepository` seam. A Cordis composition lets
 * {@link ScheduleService} bind the repository when it opens the domain; a host
 * that constructs its own repository passes it explicitly instead.
 *
 * @module @openai-harness/schedule
 */

import { randomUUID } from "node:crypto";

import type { ScheduleRepository } from "./repository";
import type {
  SchedulePromptDeliverer,
  ScheduleSessionResolver,
} from "./types";
import { ScheduleError } from "./types";

/**
 * Everything this package needs from its host besides the domain itself.
 *
 * `findSessionIdBySlug` is optional: only the default-job seed helper reads it,
 * so a host that creates jobs explicitly never has to expose session records.
 */
export interface ScheduleHost {
  /** Mints the primary key for one created job. */
  readonly mintId: () => string;
  /** Optional user-id normalizer applied to every read and write. */
  readonly sanitizeUserId?: (userId: string) => string;
  /**
   * Delivers one due prompt into its session. Omitted by a host that only
   * manages jobs; execution then rejects with `schedule_unconfigured`.
   */
  readonly deliverPrompt?: SchedulePromptDeliverer;
  /**
   * Resolves one default session slug to its session id, synchronously or
   * through a promise. Omitted by a host that never seeds default jobs.
   */
  readonly findSessionIdBySlug?: ScheduleSessionResolver;
}

/** Host bound by {@link configureScheduleHost}, if any. */
let defaultHost: ScheduleHost | undefined;

/**
 * Bind the host callbacks as the default for services and repositories
 * constructed without an explicit host. Host composition calls this once,
 * before the first schedule operation runs.
 * @param host - id minter, optional sanitizer, deliverer, and session lookup.
 */
export function configureScheduleHost(host: ScheduleHost): void {
  defaultHost = host;
}

/** Whether host composition already bound the callbacks. */
export function hasScheduleHost(): boolean {
  return defaultHost !== undefined;
}

/**
 * Resolve the configured host, or a minimal default id minter when a host
 * bound only the repository directly. Delivery and seeding still fail loud
 * when their callback is absent.
 * @returns the host bindings.
 */
export function resolveScheduleHost(): ScheduleHost {
  return defaultHost ?? { mintId: () => randomUUID() };
}

/**
 * Resolve the host and require the delivery callback.
 * @returns the configured host.
 * @throws ScheduleError with `schedule_unconfigured` when no deliverer exists.
 */
export function requireScheduleDeliverer(): SchedulePromptDeliverer {
  const deliver = resolveScheduleHost().deliverPrompt;
  if (deliver === undefined) {
    throw new ScheduleError(
      "schedule_unconfigured",
      "Delivering a scheduled prompt requires the host to configure ScheduleHost.deliverPrompt.",
    );
  }
  return deliver;
}

/** Repository bound by {@link configureScheduleRepository}, if any. */
let defaultRepository: ScheduleRepository | undefined;

/**
 * Bind the process-wide repository. {@link ScheduleService} calls this after
 * opening the domain; a host composition that constructs its own manager does
 * not need it.
 * @param repository - repository over the opened `schedule` domain.
 */
export function configureScheduleRepository(
  repository: ScheduleRepository,
): void {
  defaultRepository = repository;
}

/**
 * Release the process-wide repository if it is still the supplied one.
 * @param repository - repository the caller owns.
 */
export function releaseScheduleRepository(
  repository: ScheduleRepository,
): void {
  if (defaultRepository === repository) defaultRepository = undefined;
}

/** Whether a process-wide repository is bound. */
export function hasScheduleRepository(): boolean {
  return defaultRepository !== undefined;
}

/**
 * Resolve the configured repository or explain why there is none.
 * @returns the process-wide repository.
 */
export function requireScheduleRepository(): ScheduleRepository {
  if (defaultRepository === undefined) {
    throw new ScheduleError(
      "schedule_unconfigured",
      "Schedule service has no repository: open the schedule domain through ScheduleService or pass a repository to ScheduleManager.",
    );
  }
  return defaultRepository;
}
