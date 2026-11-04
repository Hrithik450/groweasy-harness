/**
 * Framework-free authentication primitives: session-token signing and
 * verification, plus durable credential records over a host-bound store.
 *
 * What this package owns:
 * - the HS256 auth-session token (`SessionTokens`);
 * - the credential-key grammar (`credentialKey`, `parseCredentialKey`, and the
 *   segment readers);
 * - the stored-record union and its value-free views;
 * - the record operations (`CredentialRecords`).
 *
 * What it does not own:
 * - cookies, request parsing, and redirects — those stay in the host;
 * - the database client or table definitions — they arrive through
 *   `CredentialStore`;
 * - environment reading — the host passes the secret in.
 *
 * @module @openai-harness/credentials
 */

export * from "./types";
export * from "./keys";
export * from "./store";
export * from "./records";
export * from "./session-token";
