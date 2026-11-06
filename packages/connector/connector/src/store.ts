/**
 * Host-owned bindings and the process-wide repository binding.
 *
 * The connector domain is opened by the Cordis facade
 * ({@link import("./service").ConnectorService}) or by a host that constructs
 * its own repository. This module carries only what the package cannot own:
 *
 * - the connector-id minter (`c-<uuid>`);
 * - the user-id normalizer (the application's existing `sanitizeUserId`).
 *
 * Tokens persist on the connector record itself, so mounting the service
 * needs only the storage domain — there is no credential store to wire.
 *
 * The process-wide repository lets the application's former free-function
 * call sites keep working without threading a domain handle through every
 * connector operation, mirroring the scraper/schedule packages.
 *
 * @module @openai-harness/connector/src/store
 */

import { randomUUID } from "node:crypto";

import { sanitizeUserId as defaultSanitizeUserId } from "@openai-harness/util-values";

import type { ConnectorRepository } from "./repository";
import { ConnectorStoreError } from "./types";

/** Everything the connector package needs from its host. */
export interface ConnectorHost {
  /** Mints the id for a new connector; defaults to `c-<uuid>`. */
  readonly mintId?: () => string;
  /** Normalizes a user id before it enters a domain key. */
  readonly sanitizeUserId?: (userId: string) => string;
}

/** Mint one connector id. */
export function mintConnectorId(): string {
  return `c-${randomUUID()}`;
}

/** Host bound by {@link configureConnectorHost}, if any. */
let defaultHost: ConnectorHost | undefined;

/**
 * Bind host callbacks for repositories constructed without an explicit host.
 * Host composition calls this once, before the first connector operation.
 * @param host - id minter and user-id sanitizer.
 */
export function configureConnectorHost(host: ConnectorHost): void {
  defaultHost = host;
}

/** Whether host composition already bound connector callbacks. */
export function hasConnectorHost(): boolean {
  return defaultHost !== undefined;
}

/**
 * Resolve the configured host with safe defaults for the mint and sanitize
 * callbacks.
 * @returns the effective host bindings.
 */
export function resolveConnectorHost(): ConnectorHost {
  return {
    mintId: defaultHost?.mintId ?? mintConnectorId,
    sanitizeUserId: defaultHost?.sanitizeUserId ?? defaultSanitizeUserId,
  };
}

/** Repository bound by {@link configureConnectorRepository}, if any. */
let defaultRepository: ConnectorRepository | undefined;

/**
 * Bind the process-wide repository. {@link ConnectorService} calls this after
 * opening the domain; a host that constructs its own repository passes it
 * explicitly instead.
 * @param repository - repository over the opened `connectors` domain.
 */
export function configureConnectorRepository(
  repository: ConnectorRepository,
): void {
  defaultRepository = repository;
}

/**
 * Release the process-wide repository if it is still the supplied one.
 * @param repository - repository the caller owns.
 */
export function releaseConnectorRepository(
  repository: ConnectorRepository,
): void {
  if (defaultRepository === repository) defaultRepository = undefined;
}

/** Whether a process-wide connector repository is bound. */
export function hasConnectorRepository(): boolean {
  return defaultRepository !== undefined;
}

/**
 * Resolve the configured repository or explain why there is none.
 * @returns the process-wide repository.
 * @throws ConnectorStoreError with `connector_unconfigured`.
 */
export function requireConnectorRepository(): ConnectorRepository {
  if (defaultRepository === undefined) {
    throw new ConnectorStoreError(
      "connector_unconfigured",
      "Connector service has no repository: mount ConnectorService or call configureConnectorRepository() during host composition.",
    );
  }
  return defaultRepository;
}
