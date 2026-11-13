/**
 * The slot this package fills.
 *
 * The layout frame (`@openai-harness/client-ui-layout`) owns and declares the
 * root-scoped `rightbar` seat; this package contributes its one occupant. The
 * type-only import below loads that SlotMap row, so the plugin type-checks
 * against the frame's real declaration instead of re-declaring it here.
 */
import type {} from "@openai-harness/client-ui-layout/client";

/** Root-scoped seat for the frame's right column. */
export const RIGHTBAR_SLOT = "rightbar" as const;
