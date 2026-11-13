/**
 * Host-side entry: the data vocabulary and pure helpers of the detail bar.
 *
 * This entry deliberately carries no React components, so server-side tools
 * and services can import the shared types without pulling the browser bundle.
 * The component registry and Cordis plugin live in `./client`.
 */

/** Host plugin body: the detail bar contributes nothing to the host tree. */
export function apply(): void {}

export * from "./types";
export * from "./utils";
export * from "./constants";
