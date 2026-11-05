/**
 * Durable scheduled prompts.
 *
 * The package owns the rules — cron recurrence, job lifecycle, due selection,
 * the storage domain, and the polling worker — over storage opened through
 * `ctx.storageDomain` and session delivery that stays host owned. A host
 * supplies the id minter, optional user-id sanitizer, prompt-delivery
 * callback, and session-slug lookup through a {@link ScheduleHost}; nothing
 * here imports an application alias, a framework router, or a database
 * driver.
 *
 * The file layout follows `packages/schedule/schedule` of the reference
 * deepseek-harness repository:
 *
 * - {@link storage} — the `schedule` storage domain and its record schema;
 * - {@link ScheduleRepository} — domain reads and writes over the `jobs` table;
 * - {@link ScheduleManager} — lifecycle rules and due-batch execution;
 * - {@link ScheduleService} — the Cordis `ctx.schedule` facade and domain owner;
 * - {@link ScheduleRuntime} — the background poller.
 *
 * Like that package, delivery into a Session is the host's job: this package
 * never activates a session or runs a model turn.
 *
 * @module @openai-harness/schedule
 */

export * from "./types";
export * from "./storage";
export * from "./store";
export * from "./recurrence";
export * from "./repository";
export * from "./service";
export * from "./runtime";
export * from "./defaults";

export { default } from "./service";
