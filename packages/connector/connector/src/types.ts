/**
 * Shared connector contract: the request/response envelopes every connector
 * implementation speaks, the stored connector view, and the provider
 * descriptor used by the connector registry.
 *
 * These types moved verbatim from `apps/gateway/src/lib/connectors/types.ts`
 * and the application's Drizzle-inferred connector types. The contract is
 * deliberately framework-free: connector packages import it, the gateway
 * re-exports it through a temporary shim.
 *
 * @module @openai-harness/connector/src/types
 */

/** Lifecycle state of one stored connector. */
export type ConnectorStatus = "connected" | "disconnected" | "expired";

/** Whether a background sync is currently running for one connector. */
export type ConnectorSyncStatus = "idle" | "running";

/**
 * Canonical user/business identity profile returned by a token verification.
 */
export interface ConnectorProfile {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

/**
 * Universal context passed into any connector invocation.
 * Provides the execution identity and target external tenant routing.
 */
export interface ConnectorContext {
  /** The internal authenticated user ID executing the request */
  userId: string;
  /** Unique provider slug identifier (e.g., 'meta', 'google', 'adsEasy') */
  providerSlug?: string;
  /** Direct access token override (if bypassing stored credentials) */
  accessToken?: string;
}

/**
 * Standardized input envelope for all connector operations.
 * Mirrors the ToolInput pattern (`args/params` + `context`).
 */
export interface ConnectorInput<TParams = unknown> {
  context: ConnectorContext;
  params?: TParams;
}

/**
 * Standardized response envelope returned by ALL connector operations.
 */
export type ConnectorErrorCode =
  | "AUTH_REQUIRED"
  | "TOKEN_EXPIRED"
  | "PERMISSION_DENIED"
  | "ACCOUNT_NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "NETWORK_ERROR"
  | "UPSTREAM_ERROR"
  | "UNKNOWN_ERROR";

export interface ConnectorOutput<TData = unknown> {
  success: boolean;
  data?: TData;
  error?: {
    message: string;
    code: ConnectorErrorCode | string;
  };
}

/**
 * Constructs a standardized successful connector response.
 */
export function connectorSuccess<TData>(data: TData): ConnectorOutput<TData> {
  return {
    success: true,
    data,
  };
}

/**
 * Constructs a standardized error connector response.
 */
export function connectorError<TData = never>(
  error: string,
  errorCode: ConnectorErrorCode | string = "UPSTREAM_ERROR",
): ConnectorOutput<TData> {
  return {
    success: false,
    error: {
      message: error,
      code: errorCode,
    },
  };
}

/**
 * One connector as the application reads it: the connector domain record.
 * `accessToken`, `refreshToken`, and `expiresAt` are stored on the connector
 * itself; there is no separate credential store.
 */
export interface Connector {
  id: string;
  userId: string;
  slug: string;
  providerSlug: string;
  accessToken: string | null;
  refreshToken: string | null;
  permissions: string[] | null;
  status: ConnectorStatus;
  syncStatus: ConnectorSyncStatus;
  /**
   * ISO-8601 time the current sync/analysis run started, when one is
   * recorded. A persisted `running` row whose start is missing or older than
   * the owner's run budget is stale and must be terminalized.
   */
  syncStartedAt?: string;
  metadata: Record<string, unknown> | null;
  /** Access-token expiry as epoch milliseconds, or `null` when unknown. */
  expiresAt: number | null;
}

/**
 * Upsert input. Every field except `userId`, `slug`, and `providerSlug` is
 * optional; `undefined` preserves the stored value, matching the Drizzle
 * repository's merge semantics. `accessToken: null` clears the stored token.
 */
export interface NewConnector {
  id?: string;
  userId: string;
  slug: string;
  providerSlug: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  permissions?: string[] | null;
  status?: ConnectorStatus;
  syncStatus?: ConnectorSyncStatus;
  /** ISO-8601 run start; `null` clears the stored marker. */
  syncStartedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Expiry as epoch milliseconds; `null` clears the stored expiry. */
  expiresAt?: number | null;
}

/** Service-shaped response used by the application's former service layer. */
export interface ConnectorResponse<TData = unknown> {
  success?: boolean;
  data?: TData;
  error?: string;
}

/** Why a connector storage operation could not run. */
export type ConnectorStoreErrorCode =
  | "connector_unconfigured"
  | "connector_invalid";

/** Typed failure raised by the connector repository and host bindings. */
export class ConnectorStoreError extends Error {
  /**
   * @param code - machine-readable reason.
   * @param message - operator-facing explanation.
   */
  constructor(
    readonly code: ConnectorStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConnectorStoreError";
  }
}

/**
 * One named provider registration. The connector package owns only the
 * descriptor; the provider package that exports it owns the API calls.
 */
export interface ConnectorProvider {
  /** Stored `slug` for this provider's connector row. */
  readonly slug: string;
  /** Provider identifier written to `providerSlug`. */
  readonly providerSlug: string;
  /** Human-readable provider name. */
  readonly label: string;
  /** Alternate slugs accepted by legacy lookups. */
  readonly aliases?: readonly string[];
  /** OAuth scopes the provider requires. */
  readonly requiredScopes?: readonly string[];
}
