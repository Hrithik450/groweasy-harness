/**
 * Cordis plugin for the scraper domain.
 *
 * Opening the domain is the plugin's only lifecycle work: it binds the opened
 * domain's repository as the process-wide default used by the package's
 * free-function services, and closes the domain on teardown. The host still
 * owns the storage hub and the backend route (`storageDomain.open` resolves
 * the routed backend).
 *
 * @module @openai-harness/scraper/src/plugin
 */

import type { Context } from "@deepseek-ai/cordis";

import {
  configureScraperRepository,
  releaseScraperRepository,
  ScraperRepository,
} from "./repository";
import { scraperDomain } from "./spec";

/** Cordis plugin name. */
export const name = "scraper";

/** The storage-domain form must be mounted before the scraper opens its domain. */
export const inject = ["storageDomain"];

/**
 * Open the scraper domain and bind its repository for the service wrappers.
 * @param ctx - Host context carrying the mounted `storageDomain` facility.
 * @returns resolution after the domain opened and the binding is visible.
 */
export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(scraperDomain);
  const repository = new ScraperRepository(domain);
  ctx.effect(() => async () => {
    releaseScraperRepository(repository);
    await domain.close();
  });
  configureScraperRepository(repository);
}
