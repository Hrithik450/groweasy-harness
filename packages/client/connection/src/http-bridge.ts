/**
 * node:http ↔ WHATWG fetch bridge for the `/api` transport.
 *
 * Ported verbatim from `packages/client/connection/src/http-bridge.ts` in the
 * reference deepseek-harness repository. Client-close abort, the declared and
 * streamed body caps, response backpressure and the drain-on-disconnect rule
 * are unchanged. The Peer type is this repository's `RpcPeer`.
 *
 * @module @openai-harness/client-connection
 */

import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import type { ConnectionFetchHandler, RpcPeer } from "./rpc";

/** Default carrier cap for all HTTP RPC bodies. */
export const DEFAULT_MAX_REQUEST_BODY_BYTES = 300 * 1024 * 1024;

interface BridgeServerResponse {
  readonly destroyed: boolean;
  readonly writableEnded: boolean;
  on(event: "close", listener: () => void): this;
  off(event: "close" | "drain", listener: () => void): this;
  once(event: "close" | "drain", listener: () => void): this;
  writeHead(statusCode: number, headers?: Record<string, string>): unknown;
  write(chunk: Uint8Array): boolean;
  end(): unknown;
}

/**
 * Bridge one node:http request to the fetch-shaped handler (client close
 * aborts; response writes respect backpressure and stop on disconnect).
 * @param req - incoming node:http request.
 * @param res - node:http response the bridge writes and owns to completion.
 * @param apiHandler - fetch-shaped API carrier the request is dispatched to.
 * @param peer - authenticated user the carrier admitted the request as.
 * @param maxRequestBodyBytes - maximum bytes buffered for a buffered route.
 */
export async function bridge(
  req: IncomingMessage,
  res: BridgeServerResponse,
  apiHandler: ConnectionFetchHandler,
  peer: RpcPeer,
  maxRequestBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES,
): Promise<void> {
  const abort = new AbortController();
  // Client-disconnect detection MUST hang off the response, not the request:
  // since Node 16, IncomingMessage 'close' fires as soon as the request body is
  // fully consumed, which would abort a streaming response right after open.
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });
  const url = new URL(req.url ?? "/", "http://gateway.internal");
  const method = req.method ?? "GET";
  const headers = Object.fromEntries(
    Object.entries(req.headers).filter(
      ([, value]) => typeof value === "string",
    ) as [string, string][],
  );
  const bodyMode = apiHandler.requestBodyMode({ method, url });
  let request: Request;
  if (bodyMode === "buffered") {
    const declaredLength = req.headers["content-length"];
    if (
      declaredLength !== undefined &&
      Number(declaredLength) > maxRequestBodyBytes
    ) {
      res.writeHead(413, { connection: "close" });
      res.end();
      req.destroy();
      return;
    }
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      const buffer = chunk as Buffer;
      received += buffer.byteLength;
      if (received > maxRequestBodyBytes) {
        res.writeHead(413, { connection: "close" });
        res.end();
        req.destroy();
        return;
      }
      chunks.push(buffer);
    }
    request = new Request(url, {
      method,
      headers,
      ...(chunks.length > 0 ? { body: Buffer.concat(chunks) } : {}),
      signal: abort.signal,
    });
  } else {
    request = new Request(url, {
      method,
      headers,
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      signal: abort.signal,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
  }
  const response = await apiHandler.fetch(request, peer);
  const requestUnread = bodyMode === "streaming" && !req.readableEnded;
  const responseHeaders = Object.fromEntries(response.headers.entries());
  res.writeHead(
    response.status,
    requestUnread
      ? { ...responseHeaders, connection: "close" }
      : responseHeaders,
  );
  if (response.body === null) {
    res.end();
    if (requestUnread) req.destroy();
    return;
  }
  // @types/node's ReadableStream does not declare the async iterator that the
  // runtime provides; the reference iterates the same object.
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    // Drain without writing after disconnect: cancelling Node multipart bodies
    // can race their producer and reject with ERR_INVALID_STATE.
    if (abort.signal.aborted) continue;
    // Backpressure: a false return means the socket buffer is full — wait for
    // drain instead of buffering unboundedly. 'close' also resolves so a
    // mid-wait disconnect cannot park this loop forever.
    if (!res.write(chunk) && !res.destroyed) {
      await new Promise<void>((resolve) => {
        const done = (): void => {
          res.off("drain", done);
          res.off("close", done);
          resolve();
        };
        res.once("drain", done);
        res.once("close", done);
      });
    }
  }
  res.end();
  if (requestUnread) req.destroy();
}
