/**
 * Route-level tests for the gateway cron plugin.
 *
 * The handlers are registered on a real host web server so the prefix path
 * table, the dynamic `<jobId>` / `run` shapes, method guards, and the
 * unauthenticated contract are exercised together. Authentication is checked
 * before any body parsing, so these cases never touch the cron store.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { WebServer } from "@openai-harness/host-webserver";

// The plugin imports the cron service, whose schedule binding opens the
// database singleton at module evaluation. Keep the test off the development
// database.
process.env.DATABASE_PATH = ":memory:";

const { CronRoutes } = await import("../src/routes/cron.plugin");

interface Running {
  readonly ctx: Context;
  readonly origin: string;
}

async function start(): Promise<Running> {
  const ctx = new Context();
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  await ctx.plugin(CronRoutes);
  const port = ctx.webServer.port;
  if (port === undefined) throw new Error("webserver did not bind");
  return { ctx, origin: `http://127.0.0.1:${String(port)}` };
}

test("each cron route shape keeps its method guard", async () => {
  const running = await start();
  try {
    const collection = await fetch(`${running.origin}/api/cron`, {
      method: "PUT",
    });
    assert.equal(collection.status, 405);
    assert.equal(collection.headers.get("allow"), "GET, POST");

    const job = await fetch(`${running.origin}/api/cron/job-1`, {
      method: "GET",
    });
    assert.equal(job.status, 405);
    assert.equal(job.headers.get("allow"), "PATCH, DELETE");

    const run = await fetch(`${running.origin}/api/cron/job-1/run`, {
      method: "GET",
    });
    assert.equal(run.status, 405);
    assert.equal(run.headers.get("allow"), "POST");
  } finally {
    await running.ctx.fiber.dispose();
  }
});

test("an unauthenticated request answers 401 on every cron method", async () => {
  const running = await start();
  try {
    const requests: Array<[string, string]> = [
      ["GET", "/api/cron"],
      ["POST", "/api/cron"],
      ["PATCH", "/api/cron/job-1"],
      ["DELETE", "/api/cron/job-1"],
      ["POST", "/api/cron/job-1/run"],
    ];

    for (const [method, path] of requests) {
      const response = await fetch(`${running.origin}${path}`, { method });
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.deepEqual(
        await response.json(),
        { error: "Authentication required" },
        `${method} ${path}`,
      );
    }
  } finally {
    await running.ctx.fiber.dispose();
  }
});
