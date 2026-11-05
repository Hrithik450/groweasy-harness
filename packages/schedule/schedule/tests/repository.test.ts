import test from "node:test";
import assert from "node:assert/strict";

import {
  ScheduleRepository,
  createCronJob as createDefaultJob,
} from "../src/index";
import { createHarness, insertSession } from "./harness";

test("creates a job with defaults and sanitizes the user id", async () => {
  const harness = await createHarness();

  const job = await harness.repository.createCronJob({
    userId: " user-1 ",
    sessionId: "session-1",
    type: "adManager/alerts",
    name: "Daily Alert Audit",
    prompt: "scan",
    schedule: "0 9 * * *",
    nextRunAt: "2026-01-01T03:30:00.000Z",
  });

  assert.equal(job.id, "job-1");
  assert.equal(job.userId, "user-1");
  assert.equal(job.status, "idle");
  assert.equal(job.sessionId, "session-1");
  assert.equal(job.lastRunAt, null);
  assert.equal(job.nextRunAt, "2026-01-01T03:30:00.000Z");
  assert.equal(
    harness.repository.getCronJobById(job.id)?.name,
    "Daily Alert Audit",
  );
  assert.deepEqual(
    [...harness.domain.table("jobs").keys()],
    ["user-1/job-1"],
  );
});

test("module-level functions use the configured default repository", async () => {
  const harness = await createHarness();

  const job = await createDefaultJob({
    userId: "user-1",
    sessionId: "session-1",
    name: "Immediate",
    prompt: "run",
    schedule: "0 9 * * *",
    nextRunAt: "2026-01-01T03:30:00.000Z",
  });

  assert.equal(harness.repository.getCronJobById(job.id)?.id, job.id);
});

test("lists jobs by user and by session, newest first", async () => {
  const harness = await createHarness();

  for (const [index, createdAt] of [
    "2026-01-01T00:00:00.000Z",
    "2026-01-02T00:00:00.000Z",
  ].entries()) {
    await harness.repository.createCronJob({
      userId: "user-1",
      sessionId: index === 0 ? "session-a" : "session-b",
      name: `job-${index}`,
      prompt: "p",
      schedule: "0 9 * * *",
      createdAt,
    });
  }
  await harness.repository.createCronJob({
    userId: "user-2",
    sessionId: "session-c",
    name: "other",
    prompt: "p",
    schedule: "0 9 * * *",
  });

  assert.deepEqual(
    harness.repository.getCronJobsByUserId(" user-1 ").map((job) => job.name),
    ["job-1", "job-0"],
  );
  assert.deepEqual(
    harness.repository.getCronJobsBySessionId("session-a").map((job) => job.name),
    ["job-0"],
  );
  assert.deepEqual(harness.repository.getCronJobsByUserId(""), []);
  assert.deepEqual(harness.repository.getCronJobsBySessionId(""), []);
});

test("due lookup excludes future and already running jobs", async () => {
  const harness = await createHarness();
  const cutoff = "2026-01-01T12:00:00.000Z";

  const due = await harness.repository.createCronJob({
    userId: "user-1",
    sessionId: "session-1",
    name: "due",
    prompt: "p",
    schedule: "0 9 * * *",
    nextRunAt: "2026-01-01T03:30:00.000Z",
  });
  await harness.repository.createCronJob({
    userId: "user-1",
    sessionId: "session-1",
    name: "future",
    prompt: "p",
    schedule: "0 9 * * *",
    nextRunAt: "2026-01-02T03:30:00.000Z",
  });
  await harness.repository.createCronJob({
    userId: "user-1",
    sessionId: "session-1",
    name: "running",
    prompt: "p",
    schedule: "0 9 * * *",
    nextRunAt: "2026-01-01T03:30:00.000Z",
    status: "running",
  });

  assert.deepEqual(
    harness.repository.findDueCronJobs(cutoff).map((job) => job.id),
    [due.id],
  );
});

test("updates and deletes one job", async () => {
  const harness = await createHarness();
  const job = await harness.repository.createCronJob({
    userId: "user-1",
    sessionId: "session-1",
    name: "before",
    prompt: "p",
    schedule: "0 9 * * *",
  });

  const updated = await harness.repository.updateCronJob(job.id, {
    name: "after",
    status: "failed",
  });
  assert.equal(updated?.name, "after");
  assert.equal(updated?.status, "failed");
  assert.equal(
    await harness.repository.updateCronJob("missing", { name: "x" }),
    undefined,
  );

  assert.equal(await harness.repository.deleteCronJob(job.id), true);
  assert.equal(await harness.repository.deleteCronJob(job.id), false);
  assert.equal(harness.repository.getCronJobById(job.id), undefined);
});

test("seeds one default job per type, refreshes in place, and skips unknown slugs", async () => {
  const harness = await createHarness();
  insertSession(harness, {
    id: "session-ad",
    userId: "user-1",
    slug: "adManager",
  });

  const seeds = [
    {
      type: "adManager/alerts",
      sessionSlug: "adManager",
      name: "Daily Alert Audit",
      prompt: "first",
      schedule: "0 9 * * *",
    },
    {
      type: "businessProfile/update",
      sessionSlug: "businessProfile",
      name: "Daily Business Profile Update",
      prompt: "ignored",
      schedule: "0 8 * * *",
    },
  ] as const;

  await harness.repository.ensureDefaultCronJobsByUserId("user-1", seeds);
  assert.equal(harness.repository.getCronJobsByUserId("user-1").length, 1);

  await harness.repository.ensureDefaultCronJobsByUserId("user-1", [
    { ...seeds[0], prompt: "second", schedule: "0 10 * * *" },
  ]);

  const refreshed = harness.repository.getCronJobsByUserId("user-1");
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0]?.prompt, "second");
  assert.equal(refreshed[0]?.sessionId, "session-ad");
  assert.equal(refreshed[0]?.schedule, "0 10 * * *");

  await harness.repository.ensureDefaultCronJobsByUserId("user-1", [seeds[0]], {
    runImmediately: true,
  });
  const immediate = harness.repository.getCronJobsByUserId("user-1")[0];
  assert.ok(immediate?.nextRunAt);
  assert.ok(Math.abs(Date.parse(immediate.nextRunAt!) - Date.now()) < 5_000);
});

test("seeding defaults without a session lookup fails clearly", async () => {
  const harness = await createHarness();
  const repository = new ScheduleRepository(harness.domain, {
    mintId: () => "job-x",
  });

  await assert.rejects(
    repository.ensureDefaultCronJobsByUserId("user-1", [
      {
        type: "t",
        sessionSlug: "s",
        name: "n",
        prompt: "p",
        schedule: "0 9 * * *",
      },
    ]),
    /findSessionIdBySlug/,
  );
});

test("deletes every job matching the requested types", async () => {
  const harness = await createHarness();

  for (const type of ["a", "a", "b"]) {
    await harness.repository.createCronJob({
      userId: "user-1",
      sessionId: "session-1",
      type,
      name: type,
      prompt: "p",
      schedule: "0 9 * * *",
    });
  }

  assert.equal(await harness.repository.deleteCronJobsByTypes("user-1", ["a"]), 2);
  assert.deepEqual(
    harness.repository.getCronJobsByUserId("user-1").map((job) => job.type),
    ["b"],
  );
  assert.equal(await harness.repository.deleteCronJobsByTypes("", ["b"]), 0);
});
