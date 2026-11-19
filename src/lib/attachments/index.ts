/**
 * Public surface of the application's attachment package.
 *
 * `core/` owns provider-neutral identities, references, admission rules,
 * media-type lookup, and URL parsing. `drivers/r2/` owns the content-addressed
 * Cloudflare R2 store. `host.ts` binds the store into this deployment, and
 * `materialize.ts` is the only place durable bytes may become a local scratch
 * file.
 *
 * @module @/lib/attachments
 */

export * from "./core";
export * from "./drivers/r2";
export * from "./host";
export * from "./materialize";
