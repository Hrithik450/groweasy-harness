import test from "node:test";
import assert from "node:assert/strict";

import {
  ScheduleRuntime,
  type ScheduleExecutionResult,
  type ScheduleLogger,
  type ScheduleManager,
  type ScheduleRunResult,
} from "../src/index";

interface FakeManager {
  runDueJobs: () => Promise<ScheduleRunResult[]>;
  executeJob: (jobId: string) => Promise<ScheduleExecutionResult>;
}

function fakeManager(overrides: Partial<FakeManager> = {}): ScheduleManager {
  return {
    runDueJobs: async () => [],
    executeJob: async () => ({ success: true }),
    ...overrides,
  } as unknown as ScheduleManager;
}

function captureLogger(): ScheduleLogger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    log: (message) => {
      lines.push(message);
    },
    error: (message) => {
      lines.push(message);
    },
  };
}

test("tick asks the manager for one due batch", async () => {
  let calls = 0;
  const runtime = new ScheduleRuntime({
    manager: fakeManager({
      runDueJobs: async () => {
        calls += 1;
        return [];
      },
    }),
    logger: captureLogger(),
  });

  await runtime.tick();
  await runtime.tick();

  assert.equal(calls, 2);
});

test("a tick already in flight is not overlapped", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;

  const runtime = new ScheduleRuntime({
    manager: fakeManager({
      runDueJobs: async () => {
        calls += 1;
        await gate;
        return [];
      },
    }),
    logger: captureLogger(),
  });

  const first = runtime.tick();
  await runtime.tick();

  assert.equal(calls, 1);

  release();
  await first;
  assert.equal(calls, 1);
});

test("tick logs and swallows a failed batch", async () => {
  const logger = captureLogger();
  const runtime = new ScheduleRuntime({
    manager: fakeManager({
      runDueJobs: async () => {
        throw new Error("database unavailable");
      },
    }),
    logger,
  });

  await runtime.tick();

  assert.ok(
    logger.lines.some((line) =>
      line.includes("[CronWorker] Error during tick cycle:"),
    ),
  );
});

test("triggerNow delegates to the manager", async () => {
  const seen: string[] = [];
  const runtime = new ScheduleRuntime({
    manager: fakeManager({
      executeJob: async (jobId) => {
        seen.push(jobId);
        return { success: true };
      },
    }),
    logger: captureLogger(),
  });

  const result = await runtime.triggerNow("job-1");

  assert.deepEqual(seen, ["job-1"]);
  assert.deepEqual(result, { success: true });
});

test("start is idempotent and stop disarms the poller", async () => {
  const logger = captureLogger();
  const runtime = new ScheduleRuntime({
    manager: fakeManager(),
    intervalMs: 1_000_000,
    logger,
  });

  runtime.start();
  runtime.start();
  assert.equal(runtime.running, true);
  assert.equal(
    logger.lines.filter((line) => line.includes("Starting local background scheduler"))
      .length,
    1,
  );

  runtime.stop();
  assert.equal(runtime.running, false);
  runtime.stop();
  assert.equal(
    logger.lines.filter((line) => line.includes("Background scheduler stopped"))
      .length,
    1,
  );
});
