# @openai-harness/schedule

Durable scheduled prompts: job storage, cron recurrence, due-job selection,
execution locking, and session delivery behind a host-bound seam.

Ported from `packages/schedule/schedule` of the reference deepseek-harness
repository, reduced to this repository's five-field cron dialect. As in the
reference, delivery into a Session is a host callback: this package never
activates a session, runs a model turn, imports an application alias, or opens
a database connection of its own.

## Layers

| Layer | File | Owns |
|---|---|---|
| `scheduleDomain` | `src/storage.ts` | The `schedule` v1 storage domain and its `jobs` table; the record key is `${userId}/${id}`. |
| `ScheduleRepository` | `src/repository.ts` | Reads and writes over an opened domain, plus the module-level functions the application's `@/lib/repositories/cron.repo` used to export. |
| `ScheduleManager` | `src/service.ts` | Creation anchoring, schedule-change re-anchoring, the `running` lock, due-batch execution, delivery hand-off, and failure rescheduling. |
| `ScheduleService` | `src/service.ts` | The Cordis `ctx.schedule` facade; opens the domain, binds the repository, arms the poller, and closes the domain on teardown. |
| `ScheduleRuntime` | `src/runtime.ts` | The 30-second poller with an `unref`'d timer and a re-entrancy guard. |
| `computeNextOccurrence` | `src/recurrence.ts` | Next-target arithmetic for the application's cron dialect. |
| `DEFAULT_*_CRON_JOBS` | `src/defaults.ts` | Product seed jobs (business profile, Meta alerts and suggestions) passed to `ensureDefaultCronJobs`. |

## The host seam

The host supplies everything this package cannot own:

```ts
import { configureScheduleHost } from "@openai-harness/schedule";

configureScheduleHost({
  mintId: uuidv7,            // primary-key minter
  sanitizeUserId,            // optional read/write user-id normalizer
  findSessionIdBySlug: async (userId, sessionSlug) => session?.id, // seeds only
  deliverPrompt: async ({ job }) => {
    const session = findSession(job.userId, job.sessionId);
    if (!session) throw new Error(`session ${job.sessionId} is missing`);
    await dispatchWorkflow({ type: job.type, session, prompt: job.prompt });
  },
});
```

`deliverPrompt` resolves the job's session and appends the prompt to it. A
resolved promise marks the job `idle`, records `lastRunAt`, and advances
`nextRunAt`; a rejection marks `failed` and still advances the schedule so a
broken run cannot spin.

A repository or host can also be passed directly (`new ScheduleRepository(domain, host)`,
`new ScheduleManager({ repository, host })`), which keeps tests and multi-tenant
hosts independent of the process-wide binding.

## Storage domain

`ScheduleService` declares `inject = ["storageDomain"]` and opens
`scheduleDomain` in its constructor:

```ts
const domain = await ctx.storageDomain.open(scheduleDomain);
const repository = new ScheduleRepository(domain);
configureScheduleRepository(repository);
```

The domain's `jobs` table stores the application's full job record (`id`,
`userId`, `sessionId`, `type`, `name`, `prompt`, `schedule`, `lastRunAt`,
`nextRunAt`, `status`, `createdAt`). `userId` is part of identity because jobs
are per-user: the record key is `${userId}/${id}`. A job id is unique per
host minter, and a user may hold several jobs — including several for one
session — so the key is not `${userId}/${sessionId}`.

## Use

```ts
import { ScheduleRuntime, getScheduleManager } from "@openai-harness/schedule";

const manager = getScheduleManager();

await manager.createCronJob({
  userId: "user-1",
  sessionId: "session-1",
  type: "adManager/alerts",
  name: "Daily Alert Audit",
  prompt: "Perform a thorough diagnostic scan…",
  schedule: "0 9 * * *",
  runImmediately: true,
});

const runtime = new ScheduleRuntime({ manager });
runtime.start();   // 30s poll; idempotent
runtime.stop();
```

Under Cordis, `ctx.schedule` exposes the same operations (`create`, `update`,
`delete`, `list`, `listForSession`, `execute`, `runDueJobs`) plus `start` and
`stop`. `createCronJob`, `updateCronJob`, `deleteCronJob`,
`ensureDefaultCronJobs`, `deleteCronJobsByTypes`, `executeJob`, and
`runDueJobs` are asynchronous because durable domain writes are asynchronous.

## Timing

`computeNextOccurrence` preserves the application's dialect and behaviour
verbatim:

- `0 9 * * *` — daily at 09:00 in `Asia/Kolkata` (UTC+05:30); a target at or
  before the supplied instant rolls to the next day;
- `*/N * * * *` — N minutes after the supplied instant, seconds truncated;
- `0 */N * * *` — minute fixed, N hours later;
- anything else — one day later at second zero.

The immediate-run flag (`immediate` or `runImmediately`) anchors the first run
at now, skipping the first cron occurrence.

## Tests

`tests/` drives the public surface through `../src/...` imports against an
in-memory storage backend. The root `pnpm test` glob already includes
`packages/**/*.test.ts`, so no extra test configuration is needed.

## What stays app-side

- The gateway's `/api/cron` routes remain host routes.
- `src/lib/schedule/binding.ts` binds this app's id minter, user-id sanitizer,
  session lookup, and workflow dispatcher.
- The composition root mounts `Storage`, a backend, `storage-domain`, and
  `ScheduleService`; the package cannot open its domain before that.
- The application's `cron.service.ts` stays a thin fail-soft `Response`
  adapter over this package rather than a second scheduler.
