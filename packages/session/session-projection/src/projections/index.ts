/**
 * Projection registry and type table.
 *
 * Importing this module registers the built-in units, so the gateway and the
 * browser bundle always fold the same keys with the same definitions.
 *
 * @module @openai-harness/session-projection/projections
 */

export * from "./types";
export * from "./registry";
export * from "./detail.bar";

import { detailBarProjection } from "./detail.bar";
import { sessionProjectionRegistry } from "./registry";

sessionProjectionRegistry.register(detailBarProjection);
