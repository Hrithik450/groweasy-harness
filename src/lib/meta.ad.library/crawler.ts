/**
 * Crawler seam: wraps the existing Crawl4AI client.
 *
 * @module @/lib/meta.ad.library/crawler
 */

import { crawlWebPage } from "@/lib/tools/web/search/tool";
import type { FallbackCrawler } from "./types";

export function createCrawler(): FallbackCrawler {
  return {
    async crawl(params) {
      const out = await crawlWebPage({
        args: {
          url: params.url,
          scanFullPage: true,
          maxScrollSteps: params.maxScrollSteps,
          scrollDelay: params.scrollDelay,
          delayBeforeSnapshot: params.delayBeforeSnapshot,
          pageTimeout: params.pageTimeout,
          mediaAnchorPattern: "Library ID:\\s*(\\d+)",
        },
      });
      if (!out.success || !out.data) {
        throw new Error(
          out.error || "The Crawl4AI fallback returned no page data.",
        );
      }
      return {
        markdown: out.data.markdown,
        mediaByAnchor: out.data.mediaByAnchor,
      };
    },
  };
}
