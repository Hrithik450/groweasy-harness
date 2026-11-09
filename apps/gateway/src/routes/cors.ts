/**
 * CORS admission for the Gateway's exact-path application routes.
 *
 * The Connection carrier's `/api` prefix route writes CORS headers itself, but
 * the connector/auth/attachment routes registered directly on `webServer` take
 * precedence over that prefix and are therefore responsible for their own
 * headers. In development the Vite UI runs on another origin (usually
 * `http://localhost:5173`) while connectors are fetched from the Gateway origin
 * (`http://localhost:4000`), so a browser fetch with `credentials: "include"`
 * is rejected unless the response names the caller's exact origin and permits
 * credentials. JSON writes (`POST`/`PATCH`/`DELETE`) additionally require an
 * `OPTIONS` preflight answer.
 *
 * The allowlist is `GATEWAY_ALLOWED_ORIGINS`, the same policy the OAuth return
 * hop and the Connection carrier use.
 *
 * @module @openai-harness/gateway/routes/cors
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/** UI origins served beside the Gateway (the Vite dev host by default). */
const DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173";

/** Headers a browser client may send to a connector route. */
const ALLOWED_REQUEST_HEADERS = [
  "content-type",
  "x-user-id",
  "x-anonymous-user-id",
].join(", ");

/** Resolve the configured browser origins allowed to call the Gateway. */
function allowedOrigins(): readonly string[] {
  return (process.env.GATEWAY_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Apply CORS policy to one exact route.
 *
 * A foreign `Origin` is refused before authentication; a preflight `OPTIONS`
 * is answered here and terminates the request. Routers whose internal method
 * table does not include `OPTIONS` should call this at the top of the handler.
 *
 * @param req - node request carrying the caller's `Origin`.
 * @param res - response that receives the CORS headers.
 * @returns `true` when the caller should continue handling the request;
 *          `false` when a 403/204 response has already been written.
 */
export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "") {
    if (!allowedOrigins().includes(origin)) {
      res.writeHead(403);
      res.end();
      return false;
    }
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("access-control-expose-headers", "x-user-id");
    res.setHeader("vary", "origin");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": ALLOWED_REQUEST_HEADERS,
      "access-control-max-age": "600",
    });
    res.end();
    return false;
  }

  return true;
}
