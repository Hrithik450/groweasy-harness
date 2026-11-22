/**
 * Auth surface.
 *
 * Pure JWT and request helpers live in `./session`; cookie-store helpers that
 * depend on `next/headers` live in `./session.server`. Only server modules may
 * import this barrel from within client-facing code paths.
 *
 * @module @/lib/auth
 */

export * from "./session";
export * from "./session.server";
export * from "./password";
export * from "./google";
export * from "./meta";
export * from "./shopify";
export * from "./public.origin";
export * from "./context";
export * from "./user.storage";
