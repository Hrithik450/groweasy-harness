import test from "node:test";
import assert from "node:assert/strict";

import {
  ScheduleManager,
  getScheduleManager,
  type ScheduleLogger,
} from "../src/index";
import { createHarness, type Harness } from "./harness";

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");

const quietLogger: ScheduleLogger = {
  log: () => undefined,
  error: () => undefined,
};

function managerFor(harness: Harness): ScheduleManager {
  return new ScheduleManager({
    repository: harness.repository,
    host: harness.host,
    now: () => FIXED_NOW,
    logger: quietLogger,
  });
}

async function createJob(
  harness: Harness,
  overrides: Partial<Parameters<ScheduleManager["createCronJob"]>[0]> = {},
) {
  return harness.repository.createCronJob({
    userId: "user-1",
    sessionId: "session-1",
    name: "Daily",
    prompt: "scan",
    schedule: "0 9 * * *",
    nextRunAt: "2026-01-01T03:30:00.000Z",
    ...overrides,
  });
}

test("creation anchors on the next cron occurrence", async () => {
  const harness = await createHarness();
  const manager = managerFor(harness);

  const job = await manager.createCronJob({
    userId: "user-1",
    sessionId: "session-1",
    type: "t",
    name: "Daily",
    prompt: "scan",
    schedule: "0 9 * * *",
  });

  // Creation anchors on the manager clock, not the fixture instant.
  const anchored = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(job.nextRunAt!));
  assert.equal(anchored, "09:00");
  assert.equal(job.status, "idle");
  assert.equal(job.type, "t");
});

test("immediate creation anchors at the manager clock", async () => {
  const harness = await createHarness();
  const manager = managerFor(harness);

  const job = await manager.createCronJob({
    userId: "user-1",
    sessionId: "session-1",
    name: "Now",
    prompt: "run",
    schedule: "0 9 * * *",
    runImmediately: true,
  });

  assert.equal(job.nextRunAt, FIXED_NOW.toISOString());
});

test("a changed schedule re-anchors the next run", async () => {
  const harness = await createHarness();
  const manager = managerFor(harness);
  const job = await createJob(harness);

  const renamed = await manager.updateCronJob(job.id, { name: "Renamed" });
  assert.equal(renamed?.name, "Renamed");
  assert.equal(renamed?.nextRunAt, job.nextRunAt);

  const rescheduled = await manager.updateCronJob(job.id, {
    schedule: "30 10 * * *",
  });
  assert.ok(rescheduled?.nextRunAt);
  assert.notEqual(rescheduled.nextRunAt, job.nextRunAt);
  assert.ok(Date.parse(rescheduled.nextRunAt!) > FIXED_NOW.getTime());

  assert.equal(await manager.updateCronJob("missing", { name: "x" }), undefined);
});

test("execution delivers the prompt and advances the schedule", async () => {
  const harness = await createHarness();
  const manager = managerFor(harness);
  const job = await createJob(harness);

  const result = await manager.executeJob(job.id);

  assert.deepEqual(result, { success: true });
  assert.equal(harness.delivered.length, 1);
  assert.equal(harness.delivered[0]?.id, job.id);

  const stored = harness.repository.getCronJobById(job.id);
  assert.equal(stored?.status, "idle");
  assert.equal(stored?.lastRunAt, FIXED_NOW.toISOString());
  assert.ok(stored?.nextRunAt);
  assert.ok(Date.parse(stored.nextRunAt!) > FIXED_NOW.getTime());
});

test("delivery failure marks the job failed and still advances it", async () => {
  const harness = await createHarness();
  const manager = managerFor(harness);
  const job = await createJob(harness);
  harness.delivery.failure = new Error("session missing");

  const result = await manager.executeJob(job.id);

  assert.equal(result.success, false);
  assert.equal(result.error, "session missing");
  assert.equal(harness.delivered.length, 0);

  const stored = harness.repository.getCronJobById(job.id);
  assert.equal(stored?.status, "failed");
  assert.equal(stored?.lastRunAt, null);
  assert.ok(stored?.nextRunAt);
});

test("missing and running jobs report failures without delivery", async () => {
  const harness = await createHarness();
  const manager = managerFor(harness);

  assert.deepEqual(await manager.executeJob("missing"), {
    success: false,
    error: "Cron job missing not found",
  });

  const running = await createJob(harness, { status: "running" });
  assert.deepEqual(await manager.executeJob(running.id), {
    success: false,
    error: `Cron job ${running.id} is already running`,
  });
  assert.equal(harness.delivered.length, 0);
});

test("delivery without a configured callback fails the run", async () => {
  const harness = await createHarness();
  const manager = new ScheduleManager({
    repository: harness.repository,
    host: { mintId: () => "job-x" },
    now: () => FIXED_NOW,
    logger: quietLogger,
  });
  const job = await createJob(harness);

  const result = await manager.executeJob(job.id);

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /deliverPrompt|schedule_unconfigured/);
});

test("due batches execute every due job and skip future ones", async () => {
  const harness = await createHarness();
  const manager = managerFor(harness);

  const due = await createJob(harness, { name: "due" });
  const future = await createJob(harness, {
    name: "future",
    nextRunAt: "2026-06-01T03:30:00.000Z",
  });

  const results = await manager.runDueJobs("2026-01-01T12:00:00.000Z");

  assert.deepEqual(results, [{ jobId: due.id, success: true }]);
  assert.deepEqual(
    harness.delivered.map((job) => job.id),
    [due.id],
  );
  assert.equal(
    harness.repository.getCronJobById(future.id)?.nextRunAt,
    "2026-06-01T03:30:00.000Z",
  );
});

test("due batches never reject when one delivery fails", async () => {
  const harness = await createHarness();
  const manager = new ScheduleManager({
    repository: harness.repository,
    host: {
      ...harness.host,
      deliverPrompt: async ({ job }) => {
        if (job.name === "first") throw new Error("boom");
        harness.delivered.push(job);
      },
    },
    now: () => FIXED_NOW,
    logger: quietLogger,
  });

  const first = await createJob(harness, { name: "first" });
  const second = await createJob(harness, { name: "second" });

  const results = await manager.runDueJobs("2026-01-01T12:00:00.000Z");
  const byId = new Map(results.map((result) => [result.jobId, result]));

  assert.deepEqual(byId.get(first.id), {
    jobId: first.id,
    success: false,
    error: "boom",
  });
  assert.deepEqual(byId.get(second.id), {
    jobId: second.id,
    success: true,
  });
  assert.equal(harness.delivered.length, 1);
});

test("the shared manager uses the configured default repository", async () => {
  const harness = await createHarness();

  const job = await getScheduleManager().createCronJob({
    userId: "user-1",
    sessionId: "session-1",
    name: "Shared",
    prompt: "run",
    schedule: "0 9 * * *",
  });

  assert.equal(harness.repository.getCronJobById(job.id)?.name, "Shared");
  assert.equal(getScheduleManager(), getScheduleManager());
});
