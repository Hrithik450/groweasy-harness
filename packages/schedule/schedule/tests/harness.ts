/**
 * In-memory harness: a real `schedule` domain over the shared memory storage
 * backend, a host wired to remember deliveries, and a quiet logger. Tests
 * import it from `../src/...` like any host composition would.
 */

import { Context } from "@deepseek-ai/cordis";
import Storage from "@openai-harness/storage";
import { DomainFacility } from "@openai-harness/storage-domain";
import type { Domain } from "@openai-harness/storage-domain";

import {
  ScheduleManager,
  ScheduleRepository,
  configureScheduleHost,
  configureScheduleRepository,
  type CronJobRecord,
  type ScheduleHost,
  type ScheduleLogger,
} from "../src/index";
import { scheduleDomain } from "../src/storage";
import { MemoryStorageBackend } from "../../../storage/storage-domain/tests/helpers/memory-backend";

/** Mutable delivery control shared with the harness host. */
export interface DeliveryControl {
  /** When set, the next delivery throws this error. */
  failure: Error | null;
}

/** One composed test environment. */
export interface Harness {
  readonly ctx: Context;
  readonly backend: MemoryStorageBackend;
  readonly domain: Domain<typeof scheduleDomain>;
  readonly host: ScheduleHost;
  readonly repository: ScheduleRepository;
  readonly manager: ScheduleManager;
  /** Jobs handed to the delivery callback, in call order. */
  readonly delivered: CronJobRecord[];
  /** Session slug → session id, read by the default-job seed helper. */
  readonly sessions: Map<string, string>;
  /** Toggle delivery success for failure-path tests. */
  readonly delivery: DeliveryControl;
  /** Captured log lines, for asserting worker behaviour if needed. */
  readonly logs: string[];
}

/** Creates the in-memory domain and binds it as the process-wide default. */
export async function createHarness(): Promise<Harness> {
  const ctx = new Context();
  await ctx.plugin(Storage);
  const backend = new MemoryStorageBackend();
  ctx.storage.backend.register("memory", backend);
  const facility = new DomainFacility(ctx, { backend: "memory", routes: {} });
  const domain = await facility.open(scheduleDomain);

  let sequence = 0;
  const delivered: CronJobRecord[] = [];
  const delivery: DeliveryControl = { failure: null };
  const logs: string[] = [];
  const sessions = new Map<string, string>();

  const host: ScheduleHost = {
    mintId: () => `job-${++sequence}`,
    sanitizeUserId: (userId) => userId.trim(),
    deliverPrompt: async ({ job }) => {
      if (delivery.failure) throw delivery.failure;
      delivered.push(job);
    },
    findSessionIdBySlug: (userId, slug) => sessions.get(`${userId}/${slug}`),
  };

  configureScheduleHost(host);

  const logger: ScheduleLogger = {
    log: (message) => {
      logs.push(message);
    },
    error: (message) => {
      logs.push(message);
    },
  };

  const repository = new ScheduleRepository(domain, host);
  configureScheduleRepository(repository);

  return {
    ctx,
    backend,
    domain,
    host,
    repository,
    manager: new ScheduleManager({ repository, host, logger }),
    delivered,
    sessions,
    delivery,
    logs,
  };
}

/** Inserts one session row the default-job seed helper can resolve. */
export function insertSession(
  harness: Harness,
  session: { id: string; userId: string; slug: string },
): void {
  harness.sessions.set(`${session.userId}/${session.slug}`, session.id);
}
