/**
 * Tenant registry and deployment binder for the R2 attachment backend.
 *
 * Every tenant gets exactly one memoized {@link R2AttachmentStore} whose
 * object keys live under `openai-harness/t/<tenantId>/`. There is no local-disk
 * fallback: missing storage configuration fails loudly instead of silently
 * writing to the host.
 *
 * The store class itself does not read the environment; this module is the
 * provider package's single place that resolves deployment configuration from
 * environment variables and supplies it to the store. It also owns the Cordis
 * context each standalone store registers on.
 *
 * @module @openai-harness/attachment-r2/registry
 */

import { Context } from "@deepseek-ai/cordis";
import { R2AttachmentStore } from "./index";
import type { Config as R2StoreConfig } from "./types";

/** Root prefix reserved for this deployment inside the shared bucket. */
export const ATTACHMENT_KEY_ROOT = "openai-harness";

/**
 * Root prefix actually used for object keys.
 *
 * One bucket may serve several deployments — production, development, and
 * unrelated projects — so `R2_KEY_ROOT` overrides the default and lets each
 * environment own a distinct subtree such as `harness/prod` or `harness/dev`.
 */
export function attachmentKeyRoot(): string {
  return process.env.R2_KEY_ROOT?.trim() || ATTACHMENT_KEY_ROOT;
}

/** Tenant ids are UUIDs; keep the key safe even if another id source appears. */
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_TENANT_ID_LENGTH = 128;

export type AttachmentStoreFactory = (tenantId: string) => R2AttachmentStore;

const stores = new Map<string, R2AttachmentStore>();
let testingFactory: AttachmentStoreFactory | null = null;

/**
 * Validate a tenant id before it becomes part of an R2 key.
 *
 * @throws when the tenant id is empty, too long, or contains characters that
 *   could escape the tenant prefix.
 */
export function assertTenantId(tenantId: string): string {
  const normalized = (tenantId ?? "").trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_TENANT_ID_LENGTH ||
    normalized === "." ||
    normalized === ".." ||
    !TENANT_ID_PATTERN.test(normalized)
  ) {
    throw new Error(
      `Invalid attachment tenant id "${tenantId}". Tenant ids must be non-empty, at most ${MAX_TENANT_ID_LENGTH} characters, and contain only letters, digits, dot, underscore, or hyphen.`,
    );
  }
  return normalized;
}

/** The key namespace owned by one tenant. */
export function tenantNamespace(tenantId: string): string {
  return `${attachmentKeyRoot()}/t/${assertTenantId(tenantId)}`;
}

/**
 * Resolve R2 configuration from the deployment environment.
 *
 * This is the host's responsibility: the backend package never reads the
 * environment. Accepted variables:
 * - `CLOUDFLARE_R2_ACCOUNT_ID` / `R2_ACCOUNT_ID`
 * - `CLOUDFLARE_R2_ACCESS_KEY_ID` / `R2_ACCESS_KEY_ID`
 * - `CLOUDFLARE_R2_SECRET_ACCESS_KEY` / `R2_SECRET_ACCESS_KEY`
 * - `CLOUDFLARE_R2_BUCKET_NAME` / `R2_BUCKET_NAME`
 *
 * @param namespace optional key prefix owned by this store.
 * @throws when any required value is missing.
 */
export function r2ConfigFromEnv(namespace?: string): R2StoreConfig {
  const accountId =
    process.env.CLOUDFLARE_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const accessKeyId =
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
    process.env.R2_SECRET_ACCESS_KEY;
  const bucketName =
    process.env.CLOUDFLARE_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      "Missing Cloudflare R2 attachment storage configuration. Required environment variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (CLOUDFLARE_R2_* aliases are also accepted).",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, namespace };
}

/**
 * Construct an R2-backed store from deployment configuration.
 *
 * Each standalone store gets its own Cordis context so the
 * `ctx.attachments` service key never collides across tenants without a
 * mounting plugin.
 *
 * @param namespace optional key prefix owned by this store.
 */
export function createR2StoreFromEnv(namespace?: string): R2AttachmentStore {
  return new R2AttachmentStore(new Context(), r2ConfigFromEnv(namespace));
}

/**
 * Resolve the durable attachment store for one tenant.
 *
 * Instances are memoized per validated tenant id. Construction is lazy, so
 * importing modules that merely reference attachments never requires R2
 * credentials; the first real use fails with a clear configuration error when
 * the environment is incomplete.
 */
export function attachmentStoreFor(tenantId: string): R2AttachmentStore {
  const tenant = assertTenantId(tenantId);
  const cached = stores.get(tenant);
  if (cached) return cached;

  const store = testingFactory
    ? testingFactory(tenant)
    : createR2StoreFromEnv(tenantNamespace(tenant));

  stores.set(tenant, store);
  return store;
}

/**
 * Replace store construction for unit tests. Not used by production paths.
 * Pass `null` to restore the real environment-backed factory.
 */
export function setAttachmentStoreFactoryForTesting(
  factory: AttachmentStoreFactory | null,
): void {
  testingFactory = factory;
  stores.clear();
}
