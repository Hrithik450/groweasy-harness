/**
 * Wire messages for Gateway-owned Remote streams.
 *
 * Ported from `packages/api/gateway/src/stream-protocol.ts` in the reference
 * deepseek-harness repository.
 *
 * Deliberate omission: the Remote Event frames (`REMOTE_EVENT_STREAM_ENDPOINT`
 * = `$events`, `REMOTE_EVENT_RESULT_ENDPOINT`, and the ready/emit/waterfall/
 * cancel frames) belong to the Cordis event-forwarding feature, which is not
 * cloned. Every logical-stream frame, parser, close code and message string is
 * preserved verbatim.
 *
 * Adaptation: `isRemoteJsonValue` is inlined from
 * `packages/typert/protocol/src/json-value.ts` because this repository has no
 * Typert package; the function body is unchanged.
 *
 * @module @openai-harness/sdk-protocol
 */

/** Exact WebSocket route carrying every Remote stream. */
export const REMOTE_STREAM_MUX_PATH = "/api/remote.mux";

/**
 * Complete-frame inbox budget of one logical stream.
 *
 * Ported from the `RemoteUplinkWindow` interface in
 * `packages/typert/protocol/src/` of the reference repository.
 */
export interface RemoteUplinkWindow {
  /** Buffered frame bytes one stream may hold. */
  readonly maxBytes: number;
  /** Per-frame envelope bytes charged in addition to the encoded value. */
  readonly frameOverheadBytes: number;
}

/** One logical stream request sent from the browser: open, one uplink item, uplink half-close, or cancel. */
export type RemoteStreamClientMessage =
  | {
      readonly type: "open";
      readonly streamId: string;
      readonly endpoint: string;
      readonly payload: unknown;
    }
  | {
      readonly type: "item";
      readonly streamId: string;
      readonly value?: unknown;
    }
  | { readonly type: "end"; readonly streamId: string }
  | { readonly type: "cancel"; readonly streamId: string };

/** Carrier-safe failure delivered by the Host. */
export interface RemoteStreamFailure {
  readonly code: string;
  readonly message: string;
  readonly details: object;
}

/** One logical stream frame sent from the Host. */
export type RemoteStreamServerMessage =
  | {
      readonly type: "item";
      readonly streamId: string;
      readonly value?: unknown;
    }
  | {
      readonly type: "error";
      readonly streamId: string;
      readonly error: RemoteStreamFailure;
    }
  | { readonly type: "end"; readonly streamId: string };

/**
 * Parse and validate one browser-to-Host text message.
 * @param text - complete WebSocket text message.
 * @returns the validated logical-stream request.
 */
export function parseRemoteStreamClientMessage(
  text: string,
): RemoteStreamClientMessage {
  return parseMessage(text, (value) => {
    if (
      (value.type === "cancel" || value.type === "end") &&
      exactKeys(value, ["type", "streamId"]) &&
      validId(value.streamId)
    ) {
      return value as RemoteStreamClientMessage;
    }
    if (
      value.type === "item" &&
      (exactKeys(value, ["type", "streamId"]) ||
        exactKeys(value, ["type", "streamId", "value"])) &&
      validId(value.streamId) &&
      (!Object.hasOwn(value, "value") || isRemoteJsonValue(value.value))
    ) {
      return value as RemoteStreamClientMessage;
    }
    if (
      value.type === "open" &&
      exactKeys(value, ["type", "streamId", "endpoint", "payload"]) &&
      validId(value.streamId) &&
      typeof value.endpoint === "string" &&
      value.endpoint.length > 0
    ) {
      return value as RemoteStreamClientMessage;
    }
    throw new Error("api gateway: invalid Remote stream client message");
  });
}

/**
 * Parse and validate one Host-to-browser text message.
 * @param text - complete WebSocket text message.
 * @returns the validated logical-stream frame.
 */
export function parseRemoteStreamServerMessage(
  text: string,
): RemoteStreamServerMessage {
  return parseMessage(text, (value) => {
    if (
      value.type === "item" &&
      (exactKeys(value, ["type", "streamId"]) ||
        exactKeys(value, ["type", "streamId", "value"])) &&
      validId(value.streamId)
    ) {
      return value as RemoteStreamServerMessage;
    }
    if (
      value.type === "end" &&
      exactKeys(value, ["type", "streamId"]) &&
      validId(value.streamId)
    ) {
      return value as RemoteStreamServerMessage;
    }
    if (
      value.type === "error" &&
      exactKeys(value, ["type", "streamId", "error"]) &&
      validId(value.streamId) &&
      isRecord(value.error) &&
      exactKeys(value.error, ["code", "message", "details"]) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string" &&
      isRecord(value.error.details)
    ) {
      return value as RemoteStreamServerMessage;
    }
    throw new Error("api gateway: invalid Remote stream server message");
  });
}

function parseMessage<T>(
  text: string,
  validate: (value: Record<string, unknown>) => T,
): T {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error("api gateway: Remote stream message is not JSON", {
      cause,
    });
  }
  if (!isRecord(decoded)) {
    throw new Error("api gateway: Remote stream message must be an object");
  }
  return validate(decoded);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Test whether a value crosses JSON transport without coercion or omission.
 * Ported from `packages/typert/protocol/src/json-value.ts`.
 * @param value - candidate boundary value.
 * @returns whether the value is losslessly JSON-compatible.
 */
export function isRemoteJsonValue(value: unknown): boolean {
  return visitJsonValue(value, new Set<object>());
}

function visitJsonValue(value: unknown, ancestors: Set<object>): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && !Object.is(value, -0);
  }
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        Reflect.ownKeys(value).length !== value.length + 1
      ) {
        return false;
      }
      for (let index = 0; index < value.length; index++) {
        if (
          !Object.hasOwn(value, index) ||
          !visitJsonValue(value[index], ancestors)
        ) {
          return false;
        }
      }
      return true;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor?.enumerable !== true ||
        !visitJsonValue(Reflect.get(value, key), ancestors)
      ) {
        return false;
      }
    }
    return true;
  } finally {
    ancestors.delete(value);
  }
}
