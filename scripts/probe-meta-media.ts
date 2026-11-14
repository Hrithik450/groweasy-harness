/**
 * Live diagnostic probe: reproduces alternateWebSearchTool's exact /crawl
 * request against the self-hosted scraper for a Meta Ad Library keyword
 * search, then reports what media the crawler actually returns. Not part of
 * the test suite; run manually when investigating media extraction.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/probe-meta-media.ts <query> [video|all] [iframes:0|1]
 */
import { writeFileSync } from "node:fs";

function buildMetaAdLibraryUrl(params: {
  query: string;
  country?: string;
  mediaType?: "all" | "image" | "video";
}): string {
  const { query, country = "IN", mediaType = "video" } = params;
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];
  const start = new Date(now);
  start.setDate(now.getDate() - 30);
  const startDate = start.toISOString().split("T")[0];

  const url = new URL("https://www.facebook.com/ads/library/");
  url.searchParams.set("active_status", "active");
  url.searchParams.set("ad_type", "all");
  url.searchParams.set("country", country);
  url.searchParams.set("is_targeted_country", "false");
  url.searchParams.set("media_type", mediaType);
  url.searchParams.set("q", query);
  url.searchParams.set("search_type", "keyword_unordered");
  url.searchParams.set("sort_data[direction]", "desc");
  url.searchParams.set("sort_data[mode]", "relevancy_monthly_grouped");
  url.searchParams.set("locale", "en_US");
  url.searchParams.set("start_date[min]", startDate);
  url.searchParams.set("start_date[max]", endDate);
  return url.toString();
}

async function main() {
  const query = process.argv[2] || "CRM";
  const mediaType = (process.argv[3] || "video") as "all" | "image" | "video";
  const processIframes = process.argv[4] === "1";

  const baseUrl = process.env.ALTERNATIVE_WEB_SCRAPER_URL?.trim();
  const token = process.env.ALTERNATIVE_WEB_SCRAPER_TOKEN?.trim();
  if (!baseUrl) throw new Error("ALTERNATIVE_WEB_SCRAPER_URL missing");

  const targetUrl = buildMetaAdLibraryUrl({ query, mediaType });
  const crawlerParams: Record<string, unknown> = {
    cache_mode: "bypass",
    wait_until: "domcontentloaded",
    page_timeout: 120000,
    scan_full_page: true,
    scroll_delay: 2.5,
    delay_before_return_html: 3.5,
    remove_consent_popups: true,
    remove_overlay_elements: true,
    process_iframes: processIframes,
    excluded_tags: ["select", "option", "nav", "footer", "header", "form"],
    exclude_social_media_domains: false,
    exclude_external_images: false,
    max_scroll_steps: 15,
  };

  console.log(`[probe] query=${query} media=${mediaType} iframes=${processIframes}`);
  console.log(`[probe] url=${targetUrl}`);

  const started = Date.now();
  const res = await fetch(`${baseUrl}/crawl`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      urls: [targetUrl],
      browser_config: {
        type: "BrowserConfig",
        params: {
          headless: true,
          enable_stealth: true,
          viewport_width: 1920,
          viewport_height: 1080,
        },
      },
      crawler_config: { type: "CrawlerRunConfig", params: crawlerParams },
    }),
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[probe] HTTP ${res.status} in ${elapsed}s`);
  if (!res.ok) {
    console.error(await res.text().catch(() => ""));
    process.exit(1);
  }

  interface MediaItem {
    src?: string;
  }
  interface CrawlResult {
    url?: string;
    html?: string;
    markdown?: { raw_markdown?: string };
    media?: { videos?: MediaItem[]; images?: MediaItem[] };
  }

  const json = (await res.json()) as { results?: CrawlResult[] };
  const out = `/tmp/meta-probe-${query.replace(/[^a-z0-9]/gi, "_")}-${mediaType}-iframes${processIframes ? 1 : 0}.json`;
  writeFileSync(out, JSON.stringify(json, null, 2));
  console.log(`[probe] raw JSON saved to ${out}`);

  const results = json.results ?? [];
  console.log(`[probe] results=${results.length}`);
  for (const [i, r] of results.entries()) {
    const md = r.markdown?.raw_markdown || "";
    const videos = r.media?.videos ?? [];
    const images = r.media?.images ?? [];
    console.log(`- result[${i}] url=${r.url}`);
    console.log(`  keys=${Object.keys(r).join(",")}`);
    console.log(`  markdown chars=${md.length}`);
    console.log(`  media keys=${JSON.stringify(Object.keys(r.media || {}))}`);
    console.log(`  videos=${videos.length} images=${images.length}`);
    for (const v of videos.slice(0, 8)) {
      console.log(`    video: ${JSON.stringify(v).slice(0, 300)}`);
    }
    for (const im of images.slice(0, 5)) {
      console.log(`    image: ${JSON.stringify(im).slice(0, 200)}`);
    }

    const mdVideos = md.match(/!\[[^\]]*\]\([^)]*\.(mp4|webm)[^)]*\)/gi) || [];
    console.log(`  markdown .mp4/.webm refs=${mdVideos.length}`);
    const cardRe =
      /^[ \t\u200b]*(Active|Inactive)[^\n]*\n(?:[ \t\u200b]*\n)*[ \t\u200b]*Library ID:\s*(\d+)/gim;
    const cards = Array.from(md.matchAll(cardRe));
    console.log(`  parseMetaAdCards (regex) matches=${cards.length}`);
    const idRe = /Library ID:\s*(\d+)/gi;
    console.log(`  any 'Library ID:' occurrences=${Array.from(md.matchAll(idRe)).length}`);
    console.log(`  occurrences of 'Video'=${(md.match(/\bVideo\b/g) || []).length}, 'Play'=${(md.match(/\bPlay\b/g) || []).length}`);
    console.log(`  occurrences of snapshot/render URLs=${(md.match(/\/ads\/(archive\/render_ad|library)\/\?id=/g) || []).length}`);
    console.log(`  first 1200 chars of markdown:\n---\n${md.slice(0, 1200)}\n---`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
