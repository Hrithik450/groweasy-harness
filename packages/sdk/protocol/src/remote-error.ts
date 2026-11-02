/**
 * Minimal port of the Typert Remote failure vocabulary.
 *
 * Sources in the reference deepseek-harness repository:
 * - `packages/typert/protocol/src/remote-error.ts` (`RemoteError`,
 *   `remoteErrorOf`, structural identification).
 * - `packages/api/gateway/src/index.ts` (`TypertGatewayError`, the
 *   `typert gateway: <endpoint>: ...` message convention).
 * - `packages/api/gateway/src/remote-error-codes.ts` (gateway fault details),
 *   restricted to the codes this transport step uses.
 *
 * Deliberate difference: the branded `RemoteErrorDetailsMap` module merging is
 * replaced by one closed map for the eight codes below. Domain codes thrown by
 * the session handlers keep their own string codes on the HTTP envelope and do
 * not travel through this class.
 *
 * @module @openai-harness/sdk-protocol
 */

/** Details every Gateway infrastructure failure carries. */
export interface TypertGatewayFaultDetails {
  /** Canonical endpoint, e.g. `session.follow`. */
  readonly endpoint: string;
  /** Affected wire field when the failure is field-specific. */
  readonly field?: string;
}

/** Gateway failure codes ported for this transport step. */
export type GatewayErrorCode =
  | "gateway/protocol"
  | "gateway/uplink-overflow"
  | "gateway/arguments-invalid"
  | "gateway/method-unavailable"
  | "gateway/lookup-not-found"
  | "gateway/result-invalid"
  | "gateway/internal"
  | "gateway/invocation-unavailable";

/** Details payload per gateway code. `gateway/internal` carries no fields. */
export interface RemoteErrorDetailsMap {
  "gateway/protocol": TypertGatewayFaultDetails;
  "gateway/uplink-overflow": TypertGatewayFaultDetails;
  "gateway/arguments-invalid": TypertGatewayFaultDetails;
  "gateway/method-unavailable": TypertGatewayFaultDetails;
  "gateway/lookup-not-found": TypertGatewayFaultDetails;
  "gateway/result-invalid": TypertGatewayFaultDetails;
  "gateway/internal": Record<string, never>;
  "gateway/invocation-unavailable": TypertGatewayFaultDetails;
}

/**
 * One Remote failure: a real Error carrying its stable code and typed details.
 * Discrimination is always by `code`, never by `instanceof`.
 */
export class RemoteError<
  Code extends GatewayErrorCode = GatewayErrorCode,
> extends Error {
  /** Structural marker: cross-realm/bundle identification never uses instanceof. */
  readonly isDSHRemoteError = true as const;

  /**
   * @param code - stable failure code.
   * @param message - human diagnostic carried across the wire.
   * @param details - structured payload typed by the code.
   * @param options - standard Error options (`cause` survives in-process only).
   */
  constructor(
    readonly code: Code,
    message: string,
    readonly details: RemoteErrorDetailsMap[Code],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RemoteError";
  }
}

/**
 * Structurally identify a RemoteError thrown across module or realm copies of
 * this class.
 * @param value - a caught value.
 * @returns the failure when the marker matches, otherwise undefined.
 */
export function remoteErrorOf(value: unknown): RemoteError | undefined {
  // Structural, not instanceof: an Error thrown in another realm (iframe, VM)
  // fails instanceof Error here, so the marker plus the code field is the test.
  if (
    typeof value === "object" &&
    value !== null &&
    (value as { isDSHRemoteError?: unknown }).isDSHRemoteError === true &&
    typeof (value as { code?: unknown }).code === "string"
  ) {
    return value as RemoteError;
  }
  return undefined;
}

interface GatewayErrorOptions {
  readonly cause?: unknown;
  readonly field?: string;
}

/**
 * Gateway failure produced outside the invoked business method. Rides the
 * shared Remote failure vocabulary, so its code crosses the wire instead of
 * folding to `internal`.
 */
export class TypertGatewayError extends RemoteError<GatewayErrorCode> {
  /** Canonical endpoint. */
  readonly endpoint: string;
  /** Affected wire field when the failure is field-specific. */
  readonly field: string | undefined;

  /**
   * Construct a Gateway failure without embedding boundary values in its message.
   * @param code - stable failure category.
   * @param endpoint - canonical Remote endpoint.
   * @param message - correction-oriented diagnostic without sensitive values.
   * @param options - optional field and contained cause.
   */
  constructor(
    code: Exclude<GatewayErrorCode, "gateway/internal">,
    endpoint: string,
    message: string,
    options: GatewayErrorOptions = {},
  ) {
    super(
      code,
      `typert gateway: ${endpoint}: ${message}`,
      {
        endpoint,
        ...(options.field === undefined ? {} : { field: options.field }),
      },
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "TypertGatewayError";
    this.endpoint = endpoint;
    this.field = options.field;
  }
}
