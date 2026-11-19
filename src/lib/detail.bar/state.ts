/**
 * Detail-bar wire state.
 *
 * The bar's data is stored rows, not a fold: this module only names the shape
 * the client receives.
 *
 * @module @/lib/detail.bar/state
 */

import type { DetailBarDataMap } from "./types";

/**
 * Detail-bar state, grouped by the bar that owns each tab.
 *
 * A session has exactly one bar type, so its slice is one group; the store
 * keeps them apart instead of flattening every tab into one object.
 */
export type DetailBarState = {
  [K in keyof DetailBarDataMap]?: Partial<DetailBarDataMap[K]>;
} & {
  default?: Record<string, unknown>;
};

