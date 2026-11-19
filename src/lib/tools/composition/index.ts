/**
 * Composition tools: ffmpeg, element rendering, captions, and the
 * overlay-template catalog those renders are built from.
 *
 * @module @/lib/tools/composition
 */

import {
  OVERLAY_TYPES_SLUG,
  overlayClusters,
  overlayTemplates,
} from "./render.element/utils";

export * from "./ffmpeg/tool";
export * from "./render.captions/tool";
export * from "./render.element/tool";
export * from "./render.element/utils";

/** No arguments: the catalog is fixed. */
export type FetchOverlayTypesArgs = Record<string, unknown>;

export const fetchOverlayTypesToolDefinition = {
  type: "function" as const,
  name: "fetchOverlayTypes",
  description:
    "Lists the overlay clusters with the SVG templates available under each. " +
    "Use it before renderElement to pick a template for compositing.",
  parameters: { type: "object", properties: {} },
} as const;

/** Return every overlay cluster with its template slugs. */
export async function executeFetchOverlayTypesTool() {
  return {
    success: true,
    data: OVERLAY_TYPES_SLUG.map((slug) => {
      const cluster = overlayClusters.find((entry) => entry.slug === slug);
      return {
        slug,
        name: cluster?.name ?? slug,
        description: cluster?.description ?? "",
        examples: cluster?.examples ?? "",
        templates: (overlayTemplates[slug] ?? []).map(({ slug: id }) => id),
      };
    }),
  };
}
