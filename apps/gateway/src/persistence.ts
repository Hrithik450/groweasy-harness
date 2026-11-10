/**
 * Session persistence composition.
 *
 * The append-only JSONL log, its repositories, and the derived projection cache
 * live in `@openai-harness/session-persistence`. This plugin supplies the three
 * deployment concerns those packages must not own:
 *
 * - where the session root lives — under `dataPath("sessions")`, inside this
 *   checkout, never `$HOME`;
 * - the post-commit publisher — the gateway's in-process event bus;
 * - the opened projection-cache table — from the storage domain the composition
 *   root mounts.
 *
 * It also binds the id minter and the user-existence guard the session record
 * domain asks for; accounts live in the Google-account user store.
 *
 * @module @openai-harness/gateway/wiring/persistence
 */

import type { Context } from "@deepseek-ai/cordis";
import { dataPath } from "@openai-harness/paths";
import { uuidv7 } from "@openai-harness/uuid";
import { getUserByUserId } from "@openai-harness/google-account";
import { configureSessionPersistence } from "@openai-harness/session";
import {
  JsonlSessionPersistenceBackend,
  configureProjectionCacheLoader,
  configureSessionEventsStore,
  configureSessionPersistenceBackend,
  configureSessionStore,
  projectionCacheDomainSpec,
  sessionEventsRepo,
  type ProjectionCacheTable,
} from "@openai-harness/session-persistence";
import { publishSessionEvents } from "./buses";

/** Cordis plugin name. */
export const name = "gateway:persistence";

/** The projection cache opens through a mounted storage domain. */
export const inject = ["storageDomain"];

/**
 * Bind the process-wide session stores and open the projection cache.
 * @param ctx - context carrying `storageDomain`.
 */
export async function apply(ctx: Context): Promise<void> {
  configureSessionPersistenceBackend(
    new JsonlSessionPersistenceBackend({ root: dataPath("sessions") }),
  );

  configureSessionEventsStore({ publish: publishSessionEvents });

  // The durable `Session` domain appends and replays through this ledger.
  configureSessionPersistence(sessionEventsRepo);

  configureSessionStore({
    mintId: uuidv7,
    userExists: (userId) => getUserByUserId(userId).data != null,
  });

  const domain = await ctx.storageDomain.open(projectionCacheDomainSpec);
  ctx.effect(() => () => domain.close());

  const checkpoints = domain.table("checkpoints") as unknown as ProjectionCacheTable;
  configureProjectionCacheLoader(async () => checkpoints);
}
