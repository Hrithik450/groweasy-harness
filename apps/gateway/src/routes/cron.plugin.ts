/**
 * Cron/schedule HTTP routes on the gateway host web server.
 *
 * This is a direct port of the Next App Router handlers that used to live under
 * `src/app/api/cron/**`. Every path, method, authentication rule, validation
 * message and response body is preserved:
 *
 * - `GET`/`POST /api/cron` list and create jobs;
 * - `PATCH`/`DELETE /api/cron/<jobId>` update and delete one job;
 * - `POST /api/cron/<jobId>/run` executes one job.
 *
 * The transport shell changed only:
 *
 * - `NextRequest` / `NextResponse` are replaced by `node:http` request/response
 *   objects plus a WHATWG {@link Request} built from the incoming message, so
 *   the handlers keep using `request.json()`.
 * - `getAuthSessionFromRequest` (which imported `next/headers` through
 *   `@/lib/auth/session`) is replaced by the gateway's shared request-identity
 *   resolver (session cookie, `oh-user-id` identity cookie, anonymous
 *   headers/query).
 * - The host web server has no path-parameter kind, so the plugin registers the
 *   `/api/cron` prefix and parses `<jobId>` and `run` from the remaining
 *   pathname, exactly as the attachments plugin resolves its `<attachmentId>`.
 *
 * The cron service itself stays in `@/lib/services/cron.service`; this file
 * only adapts HTTP to it.
 *
 * @module @openai-harness/gateway/routes/cron
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { Service, type Context } from "@deepseek-ai/cordis";
import type { WebRoute } from "@openai-harness/host-webserver";
import { getRequestUser } from "../request-user";
import * as cronService from "../cron";

/** Prefix owned by the cron handlers. */
export const CRON_BASE_PATH = "/api/cron";

/** Method set the original route files exported for each shape. */
type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** One JSON response produced by a route handler. */
interface RouteResult {
  readonly status: number;
  readonly body: unknown;
}

/** Route handler after authentication; `jobId` is set for job-scoped routes. */
type RouteHandler = (
  request: Request,
  userId: string,
  jobId: string | undefined,
) => Promise<RouteResult>;

/**
 * Parsed JSON body. The Next handlers read `await req.json()` as `any`; this
 * alias keeps that behaviour explicit in one place.
 */
 
type JsonObject = Record<string, any>;

/** `Error#message` for the generic 500 envelopes. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Write one JSON response with the same body shape `NextResponse.json` produced. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Resolve the authenticated user through the gateway's shared identity
 * resolver: verified session cookie, browser identity cookie, then the
 * anonymous header/query fallbacks. Every failure is a 401, never a 500.
 */
async function resolveUserId(req: IncomingMessage): Promise<string | null> {
  try {
    return (await getRequestUser(req))?.id ?? null;
  } catch {
    return null;
  }
}

/** Build the request URL against a fixed base so path-only node URLs work. */
function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://gateway.internal");
}

/**
 * Build a Fetch `Request` over the live node request. Bodies are streamed, so
 * `request.json()` behaves exactly as it did under the Next adapter;
 * `duplex: "half"` is the Node requirement for a streaming request body.
 */
function toFetchRequest(req: IncomingMessage): Request {
  const url = requestUrl(req);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  return new Request(url, {
    method,
    headers,
    body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

/** Decode one path segment, falling back to the raw text when malformed. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Run one handler inside the original route's generic 500 envelope. */
async function guard(
  operation: () => Promise<RouteResult>,
): Promise<RouteResult> {
  try {
    return await operation();
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/* -------------------------------------------------------------------------- */
/* Handlers — ported one-for-one from the deleted Next route files.            */
/* -------------------------------------------------------------------------- */

/** GET /api/cron — list jobs for a session (query) or the authenticated user. */
async function handleListCronJobs(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  return guard(async () => {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (sessionId) {
      const result = await cronService.getCronJobsBySessionId(sessionId);
      if (!result.success) {
        return { status: 400, body: { error: result.error } };
      }
      return { status: 200, body: { jobs: result.data || [] } };
    }

    const result = await cronService.getCronJobsByUserId(userId);
    if (!result.success) {
      return { status: 400, body: { error: result.error } };
    }

    return { status: 200, body: { jobs: result.data || [] } };
  });
}

/** POST /api/cron — create a job. */
async function handleCreateCronJob(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  return guard(async () => {
    const body = (await request.json()) as JsonObject;
    const { sessionId, name, prompt, schedule, runImmediately, type } = body;

    if (!sessionId || !name || !prompt || !schedule) {
      return {
        status: 400,
        body: {
          error: "Missing required fields: sessionId, name, prompt, schedule",
        },
      };
    }

    const result = await cronService.createCronJob({
      userId,
      sessionId,
      type: type || null,
      name,
      prompt,
      schedule,
      runImmediately: Boolean(runImmediately),
    });

    if (!result.success) {
      return { status: 400, body: { error: result.error } };
    }

    return { status: 201, body: { job: result.data } };
  });
}

/** PATCH /api/cron/<jobId> — update a job's configuration. */
async function handleUpdateCronJob(
  request: Request,
  _userId: string,
  jobId: string | undefined,
): Promise<RouteResult> {
  return guard(async () => {
    const body = (await request.json()) as JsonObject;
    const result = await cronService.updateCronJob(jobId ?? "", body);
    if (!result.success) {
      return { status: 400, body: { error: result.error } };
    }
    return { status: 200, body: { job: result.data } };
  });
}

/** DELETE /api/cron/<jobId> — delete a job. */
async function handleDeleteCronJob(
  _request: Request,
  _userId: string,
  jobId: string | undefined,
): Promise<RouteResult> {
  return guard(async () => {
    const result = await cronService.deleteCronJob(jobId ?? "");
    if (!result.success) {
      return { status: 400, body: { error: result.error } };
    }
    return { status: 200, body: { success: true } };
  });
}

/** POST /api/cron/<jobId>/run — execute one job immediately. */
async function handleRunCronJob(
  _request: Request,
  _userId: string,
  jobId: string | undefined,
): Promise<RouteResult> {
  return guard(async () => {
    const result = await cronService.executeJob(jobId ?? "");
    if (!result.success) {
      return { status: 400, body: { error: result.error } };
    }
    return { status: 200, body: { success: true } };
  });
}

/* -------------------------------------------------------------------------- */
/* Route table                                                                 */
/* -------------------------------------------------------------------------- */

/** Method handlers for each path shape the Next routes exported. */
const COLLECTION_METHODS: Partial<Record<HttpMethod, RouteHandler>> = {
  GET: handleListCronJobs,
  POST: handleCreateCronJob,
};

const JOB_METHODS: Partial<Record<HttpMethod, RouteHandler>> = {
  PATCH: handleUpdateCronJob,
  DELETE: handleDeleteCronJob,
};

const RUN_METHODS: Partial<Record<HttpMethod, RouteHandler>> = {
  POST: handleRunCronJob,
};

/** Answer a path registered for other methods, as the Next framework did. */
function methodNotAllowed(
  req: IncomingMessage,
  res: ServerResponse,
  methods: Partial<Record<HttpMethod, RouteHandler>>,
): void {
  res.writeHead(405, { allow: Object.keys(methods).join(", ") });
  res.end();
  if (!req.readableEnded) req.resume();
}

/** Answer a path the Next route tree did not own. */
function notFound(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(404);
  res.end();
  if (!req.readableEnded) req.resume();
}

/**
 * One `node:http` handler for the `/api/cron` prefix: split the remaining
 * pathname into `<jobId>` / `run`, guard the method, authenticate, and write the
 * handler's JSON result.
 */
function createRouteHandler(): (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void> {
  return async (req, res) => {
    // An unread request body must not park a keep-alive connection.
    const finish = (status: number, body: unknown): void => {
      writeJson(res, status, body);
      if (!req.readableEnded) req.resume();
    };

    const pathname = requestUrl(req).pathname;
    const rest = pathname
      .slice(CRON_BASE_PATH.length)
      .replace(/^\/+/, "");
    const segments = rest === "" ? [] : rest.split("/");

    let methods: Partial<Record<HttpMethod, RouteHandler>>;
    let jobId: string | undefined;

    if (segments.length === 0) {
      methods = COLLECTION_METHODS;
    } else if (segments.length === 1 && segments[0] !== "") {
      methods = JOB_METHODS;
      jobId = decodeSegment(segments[0] ?? "");
    } else if (
      segments.length === 2 &&
      segments[0] !== "" &&
      segments[1] === "run"
    ) {
      methods = RUN_METHODS;
      jobId = decodeSegment(segments[0] ?? "");
    } else {
      notFound(req, res);
      return;
    }

    const method = (req.method ?? "GET").toUpperCase() as HttpMethod;
    const handler = methods[method];
    if (!handler) {
      methodNotAllowed(req, res, methods);
      return;
    }

    const userId = await resolveUserId(req);
    if (!userId) {
      finish(401, { error: "Authentication required" });
      return;
    }

    let request: Request;
    try {
      request = toFetchRequest(req);
    } catch (err) {
      finish(500, { error: messageOf(err) });
      return;
    }

    let result: RouteResult;
    try {
      result = await handler(request, userId, jobId);
    } catch (err) {
      result = { status: 500, body: { error: messageOf(err) } };
    }
    finish(result.status, result.body);
  };
}

/**
 * Cron routes as a Cordis service on the gateway web server.
 *
 * `webServer` is a static dependency, so the constructor runs only after the
 * listener service has activated and every route registration is owned by this
 * fiber's effect scope.
 */
export class CronRoutes extends Service {
  static inject = ["webServer"];

  constructor(ctx: Context) {
    super(ctx, "cronRoutes");

    const route: WebRoute = {
      kind: "prefix",
      path: CRON_BASE_PATH,
      handler: createRouteHandler(),
    };
    ctx.effect(
      () => ctx.webServer.register(route),
      "gateway: cron routes",
    );
  }
}

export default CronRoutes;
