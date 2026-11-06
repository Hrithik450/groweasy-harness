/**
 * Connector contract, durable state, and registry.
 *
 * This package replaces the application's connector plumbing:
 *
 * - `types.ts` — the request/response contract and provider descriptor
 *   (from `lib/connectors/types.ts` and the Drizzle-inferred connector types);
 * - `storage.ts` — the `connectors` domain, tokens included, following the
 *   reference `schedule` package's `defineDomain`/`domainTable` layout;
 * - `repository.ts` — the Drizzle repository semantics over the domain;
 * - `service.ts` — the Cordis facade and the application's former
 *   free-function service API.
 *
 * Provider implementations live in sibling packages:
 * `@openai-harness/connector-meta`, `@openai-harness/connector-shopify`, and
 * `@openai-harness/connector-business-profile`.
 *
 * @module @openai-harness/connector
 */

export * from "./types";
export * from "./storage";
export * from "./store";
export * from "./repository";
export * from "./service";
