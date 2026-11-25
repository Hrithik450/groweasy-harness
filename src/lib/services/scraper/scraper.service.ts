/**
 * Compatibility re-exports. The implementation lives in the package module
 * `@/lib/meta.ad.library`, so the pipeline can be published independently.
 *
 * @module @/lib/services/scraper/scraper.service
 */

export { buildMetaAdLibraryUrl } from "@/lib/meta.ad.library/urls";
export { parseMetaAdCards } from "@/lib/meta.ad.library/parse";
