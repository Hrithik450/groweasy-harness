/**
 * Meta Ad Library scraper: page parsing, embedding relevance, and durable ad
 * storage over the `scraper` storage domain.
 *
 * Code moved from `apps/gateway/src/lib/services/scraper`; the application's
 * original modules are temporary re-export shims until their call sites are
 * rewired. The storage layer follows the reference `schedule` package:
 * `spec.ts` declares the domain with `defineDomain`/`domainTable`, and
 * `repository.ts` reads and writes the opened domain's table handles.
 *
 * Load under Cordis as a plugin (`ctx.plugin(Scraper)`) to open the domain and
 * bind the default repository; or open the domain yourself and call
 * `configureScraperRepository(new ScraperRepository(domain))`.
 *
 * @module @openai-harness/scraper
 */

export * from "./scraper.service";
export * from "./ingestion.service";
export * from "./ad.relevance.service";
export * from "./display";
export * from "./spec";
export * from "./repository";
export * from "./plugin";
export * from "./policy";
export * from "./semantic-cache";
export * from "./utils";
