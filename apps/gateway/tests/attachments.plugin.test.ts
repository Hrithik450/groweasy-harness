/**
 * Route-level tests for the gateway attachment plugin.
 *
 * The handlers are registered on a real host web server so the path table,
 * method guards, and public error contract are exercised together. Upload
 * parsing and R2 delivery need deployment credentials, so those paths are
 * covered only through their pre-admission answers (401/400/404/405).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { WebServer } from "@openai-harness/host-webserver";

// The plugin imports the application user service, whose database singleton
// opens at module evaluation. Keep the test off the development database.
process.env.DATABASE_PATH = ":memory:";

const { AttachmentsRoutes } = await import(
  "../src/routes/attachments.plugin"
);

interface Running {
  readonly ctx: Context;
  readonly origin: string;
}

async function start(): Promise<Running> {
  const ctx = new Context();
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  await ctx.plugin(AttachmentsRoutes);
  const port = ctx.webServer.port;
  if (port === undefined) throw new Error("webserver did not bind");
  return { ctx, origin: `http://127.0.0.1:${String(port)}` };
}

test("each moved route keeps its method guard", async () => {
  const running = await start();
  try {
    const upload = await fetch(`${running.origin}/api/attachments/upload`, {
      method: "PUT",
    });
    assert.equal(upload.status, 405);
    assert.equal(upload.headers.get("allow"), "POST");

    const files = await fetch(`${running.origin}/api/attachments/anything`, {
      method: "DELETE",
    });
    assert.equal(files.status, 405);
    assert.equal(files.headers.get("allow"), "GET, HEAD");

    const download = await fetch(`${running.origin}/api/download`, {
      method: "POST",
    });
    assert.equal(download.status, 405);
    assert.equal(download.headers.get("allow"), "GET, HEAD");
  } finally {
    await running.ctx.fiber.dispose();
  }
});

test("upload answers 401 before validating the content type", async () => {
  const running = await start();
  try {
    const response = await fetch(`${running.origin}/api/attachments/upload`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not a file",
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Authentication required",
    });
  } finally {
    await running.ctx.fiber.dispose();
  }
});

test("attachment delivery distinguishes a missing filename, unauthenticated read, and missing audio", async () => {
  const running = await start();
  try {
    const missingFilename = await fetch(`${running.origin}/api/attachments`);
    assert.equal(missingFilename.status, 400);
    assert.deepEqual(await missingFilename.json(), {
      error: "Filename is required",
    });

    const id = `sha256:${"a".repeat(64)}`;
    const unauthenticated = await fetch(
      `${running.origin}/api/attachments/${id}`,
    );
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await unauthenticated.json(), {
      error: "Authentication required",
    });

    const missingAudio = await fetch(
      `${running.origin}/api/attachments/audios/does-not-exist.mp3`,
    );
    assert.equal(missingAudio.status, 404);
    assert.deepEqual(await missingAudio.json(), {
      error: "Attachment not found",
    });
  } finally {
    await running.ctx.fiber.dispose();
  }
});

test("download reports a missing url parameter", async () => {
  const running = await start();
  try {
    const response = await fetch(`${running.origin}/api/download`);
    assert.equal(response.status, 400);
    assert.equal(await response.text(), "Missing url parameter");
  } finally {
    await running.ctx.fiber.dispose();
  }
});

test("a foreign browser Origin is refused with 403", async () => {
  const running = await start();
  try {
    const response = await fetch(`${running.origin}/api/download?url=x`, {
      headers: { origin: "http://evil.test" },
    });
    assert.equal(response.status, 403);
    assert.equal(await response.text(), "forbidden");
  } finally {
    await running.ctx.fiber.dispose();
  }
});
