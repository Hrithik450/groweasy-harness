import type { ConnectorStatus } from "@/lib/db";
export type { ConnectorStatus };

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
  /** Direct access token override (if bypassing stored database credentials) */
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
