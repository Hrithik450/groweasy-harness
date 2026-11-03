/**
 * Stdio JSON-RPC transport.
 *
 * This package is deliberately transport-only. It reads newline-delimited
 * JSON-RPC 2.0 requests from one input stream, invokes the registered request
 * handler, and writes responses to one output stream. It owns no session
 * commands and imports no application or session packages.
 *
 * Nothing in this repository consumes the stdio transport today: the Next
 * application serves browser HTTP and the Gateway serves the Connection
 * carrier plus the Remote stream mux. The package is kept minimal rather than
 * inventing a consumer; a future out-of-process SDK host can load this plugin
 * and register its own handler.
 *
 * Stdout is reserved for protocol frames: this plugin must not be loaded with
 * a stdout logger. Named plugin exports are not used here, so Cordis applies
 * the default export directly.
 *
 * @module @openai-harness/sdk-jsonrpc-server
 */

import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { Context, Service } from "@deepseek-ai/cordis";

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Stdio JSON-RPC transport provided by this plugin. */
    sdkJsonRpcTransport: StdioJsonRpcTransport;
  }
}

/** JSON-RPC 2.0 request as this transport accepts it on the wire. */
export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  /** Absent for notifications, which receive no response. */
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: unknown;
}

/** Handler invoked for one decoded request. */
export type JsonRpcRequestHandler = (
  method: string,
  params: unknown,
) => Promise<unknown> | unknown;

/** Deployment configuration; production uses the process streams. */
export interface StdioJsonRpcConfig {
  /** Transport input; defaults to `process.stdin`. */
  readonly input?: Readable;
  /** Transport output; defaults to `process.stdout`. */
  readonly output?: Writable;
}

/** One JSON-RPC error object. */
interface JsonRpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

const PARSE_ERROR = -32_700;
const METHOD_NOT_FOUND = -32_601;
const INTERNAL_ERROR = -32_603;

/**
 * Decode one transport line.
 * @param line - one complete line from the input stream.
 * @returns the validated request, or `undefined` for a blank line.
 * @throws when the line is not a JSON-RPC 2.0 request object.
 */
export function parseJsonRpcLine(line: string): JsonRpcRequest | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) return undefined;

  let decoded: unknown;
  try {
    decoded = JSON.parse(trimmed) as unknown;
  } catch (cause) {
    throw new Error("JSON-RPC line is not JSON", { cause });
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw new Error("JSON-RPC line must be an object");
  }

  const record = decoded as Record<string, unknown>;
  if (record.jsonrpc !== "2.0") {
    throw new Error('JSON-RPC request must declare "jsonrpc": "2.0"');
  }
  if (typeof record.method !== "string" || record.method.length === 0) {
    throw new Error("JSON-RPC request must declare a non-empty method");
  }
  const id = record.id;
  if (
    id !== undefined &&
    id !== null &&
    typeof id !== "string" &&
    typeof id !== "number"
  ) {
    throw new Error("JSON-RPC request id must be a string, number, or null");
  }

  return {
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id }),
    method: record.method,
    ...(Object.hasOwn(record, "params") ? { params: record.params } : {}),
  };
}

/**
 * Line-delimited JSON-RPC transport over a pair of Node streams.
 *
 * One handler serves every method; method routing belongs to the host that
 * loads this plugin.
 */
export class StdioJsonRpcTransport extends Service {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly pending = new Set<Promise<void>>();
  private lines: Interface | undefined;
  private handler: JsonRpcRequestHandler | undefined;

  /**
   * @param ctx - owning Context; the transport starts with the plugin and
   *   closes with its fiber.
   * @param config - stream overrides for tests and nonprocess hosts.
   */
  constructor(ctx: Context, config: StdioJsonRpcConfig = {}) {
    super(ctx, "sdkJsonRpcTransport");
    this.input = config.input ?? process.stdin;
    this.output = config.output ?? process.stdout;

    ctx.effect(() => {
      this.start();
      return () => {
        this.close();
      };
    }, "sdk-jsonrpc-server: stdio transport");
  }

  /**
   * Register the request handler.
   * @param handler - receives `(method, params)` and returns the result value.
   * @returns an unsubscribe function.
   */
  onRequest(handler: JsonRpcRequestHandler): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) this.handler = undefined;
    };
  }

  /** Begin reading requests. Idempotent. */
  start(): void {
    if (this.lines !== undefined) return;
    const lines = createInterface({
      input: this.input,
      crlfDelay: Infinity,
    });
    lines.on("line", (line) => {
      this.track(this.accept(line));
    });
    this.lines = lines;
  }

  /** Stop reading requests. Idempotent. */
  close(): void {
    this.lines?.close();
    this.lines = undefined;
  }

  /** Resolve after every response already accepted has been written. */
  async flush(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  private track(task: Promise<void>): void {
    this.pending.add(task);
    void task
      .catch(() => undefined)
      .finally(() => {
        this.pending.delete(task);
      });
  }

  private async accept(line: string): Promise<void> {
    let request: JsonRpcRequest | undefined;
    try {
      request = parseJsonRpcLine(line);
    } catch (error) {
      await this.writeError(undefined, PARSE_ERROR, messageOf(error));
      return;
    }
    if (request === undefined) return;

    // Notifications carry no id and receive no response.
    const isNotification = request.id === undefined;
    try {
      const result = await this.invoke(request.method, request.params);
      if (!isNotification) await this.writeResult(request.id ?? null, result);
    } catch (error) {
      if (!isNotification) {
        const code =
          error instanceof JsonRpcFailure ? error.code : INTERNAL_ERROR;
        await this.writeError(request.id ?? null, code, messageOf(error));
      }
    }
  }

  private async invoke(method: string, params: unknown): Promise<unknown> {
    const handler = this.handler;
    if (handler === undefined) {
      throw new JsonRpcFailure(METHOD_NOT_FOUND, `Method ${method} is not available`);
    }
    return await handler(method, params);
  }

  private writeResult(id: string | number | null, result: unknown): Promise<void> {
    return this.write({ jsonrpc: "2.0", id, result });
  }

  private writeError(
    id: string | number | null | undefined,
    code: number,
    message: string,
  ): Promise<void> {
    const error: JsonRpcErrorObject = { code, message };
    return this.write({ jsonrpc: "2.0", id: id ?? null, error });
  }

  private write(message: unknown): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.output.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

/** Internal failure carrying an explicit JSON-RPC error code. */
class JsonRpcFailure extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = "JsonRpcFailure";
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default StdioJsonRpcTransport;
