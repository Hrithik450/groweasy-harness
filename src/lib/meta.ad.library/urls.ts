/**
 * Meta Ad Library search URL construction.
 *
 * @module @/lib/meta.ad.library/urls
 */

export function buildMetaAdLibraryUrl(params: {
  query: string;
  locale?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
  longevityDays?: number;
  mediaType?: "all" | "image" | "video";
}): string {
  const {
    query,
    locale = "en_US",
    country = "IN",
    startDate,
    endDate,
    longevityDays = 30,
    mediaType = "all",
  } = params;

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
  url.searchParams.set("locale", locale);

  const now = new Date();
  const max = endDate || now.toISOString().split("T")[0];
  const start = new Date(now);
  start.setDate(now.getDate() - Math.max(1, longevityDays));
  url.searchParams.set(
    "start_date[min]",
    startDate || start.toISOString().split("T")[0],
  );
  url.searchParams.set("start_date[max]", max);

  return url.toString();
}
