import {
  extractMediaUrls,
  getScrapedAdsByIds,
  isMediaUrlExpired,
  type ScrapedAd,
} from "@openai-harness/scraper";
import type {
  CompetitorAd,
  CompetitorAdFormat,
  CompetitorProfileItem,
  BusinessProfileConnectorSchema,
  BusinessProfileBrand,
  BusinessProfileGeography,
  BusinessProfileCompetitors,
  BusinessProfileKeywords,
  Country,
} from "@openai-harness/connector-business-profile";

/** Hard ceiling for each business keyword list. */
export const MAX_KEYWORDS_PER_LIST = 10;

/** Format of a competitor ad; anything unrecognized is treated as static. */
function normalizeAdFormat(value: unknown): CompetitorAdFormat {
  return value === "video" ? "video" : "static";
}

/**
 * Normalize collector-supplied competitor ads: keep the ad URL and media
 * URL(s) verbatim, drop entries without an ad URL, and dedupe by ad URL.
 */
export function normalizeCompetitorAds(rawAds: unknown): CompetitorAd[] {
  if (!Array.isArray(rawAds)) return [];

  const ads: CompetitorAd[] = [];
  const seen = new Set<string>();

  for (const raw of rawAds) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const adUrl = typeof item.adUrl === "string" ? item.adUrl.trim() : "";
    if (!adUrl || seen.has(adUrl.toLowerCase())) continue;
    seen.add(adUrl.toLowerCase());

    const rawMedia = Array.isArray(item.mediaUrls)
      ? item.mediaUrls
      : typeof item.mediaUrl === "string"
        ? [item.mediaUrl]
        : [];
    const mediaUrls = deduplicateStrings(
      rawMedia.filter((m): m is string => typeof m === "string" && m.trim().length > 0),
    );

    const label =
      typeof item.label === "string" && item.label.trim()
        ? item.label.trim()
        : undefined;

    ads.push({
      format: normalizeAdFormat(item.format),
      adUrl,
      ...(mediaUrls.length > 0 ? { mediaUrls } : {}),
      ...(label ? { label } : {}),
    });
  }

  return ads;
}

/** Meta Ad Library id embedded in an ad URL, or null when absent. */
function libraryIdFromAdUrl(adUrl: string): string | null {
  try {
    const id = new URL(adUrl).searchParams.get("id");
    return id !== null && /^\d+$/.test(id) ? id : null;
  } catch {
    const match = /[?&]id=(\d+)/.exec(adUrl);
    return match ? match[1] : null;
  }
}

/**
 * Fill each competitor ad's media from the crawl that captured it.
 *
 * The model transcribes ad URLs and labels reliably but drops 400-character
 * signed CDN URLs, so relying on its copy left video ads (and some statics)
 * with no creative. The scraper store already holds the card for every ad we
 * researched, so the media is read back from there: it is the collector's own
 * output, current as of the last crawl, and the only source that is
 * guaranteed to exist whenever Meta served the ad with media.
 *
 * An ad the store has never seen keeps whatever the caller supplied; expired
 * links are dropped rather than rendered as broken media.
 *
 * @param competitors - competitor records about to be saved.
 * @param loadAds - lookup seam for tests.
 */
export async function attachCollectedMedia(
  competitors: CompetitorProfileItem[],
  loadAds: (
    ids: string[],
  ) => Promise<Map<string, ScrapedAd[]>> = async (ids) => {
    const result = await getScrapedAdsByIds(ids);
    return result.success && result.data
      ? result.data
      : new Map<string, ScrapedAd[]>();
  },
  nowMs: number = Date.now(),
): Promise<CompetitorProfileItem[]> {
  const ids = new Set<string>();
  for (const competitor of competitors) {
    for (const ad of competitor.ads || []) {
      const id = libraryIdFromAdUrl(ad.adUrl);
      if (id !== null) ids.add(id);
    }
  }
  if (ids.size === 0) return competitors;

  const stored = await loadAds([...ids]);

  const withMedia = (ad: CompetitorAd): CompetitorAd => {
    const id = libraryIdFromAdUrl(ad.adUrl);
    const row = id === null ? undefined : stored.get(id)?.[0];
    const collected = row ? extractMediaUrls(row.content, nowMs) : { videos: [], images: [] };
    const live = collected.videos.length + collected.images.length > 0;

    if (live) {
      return {
        ...ad,
        format: collected.videos.length > 0 ? "video" : "static",
        mediaUrls: [...collected.videos, ...collected.images],
      };
    }

    const supplied = (ad.mediaUrls || []).filter(
      (url) => !isMediaUrlExpired(url, nowMs),
    );
    if (supplied.length > 0) return { ...ad, mediaUrls: supplied };
    // Nothing live to show: drop the key so the UI renders the ad's title
    // alone rather than a broken creative.
    const { mediaUrls: _expired, ...rest } = ad;
    return rest;
  };

  return competitors.map((competitor) => ({
    ...competitor,
    ads: (competitor.ads || []).map(withMedia),
  }));
}

/** Union two ad lists by ad URL; incoming entries win on conflict. */
function mergeCompetitorAds(
  existingAds: CompetitorAd[],
  incomingAds: CompetitorAd[],
): CompetitorAd[] {
  return normalizeCompetitorAds([...(incomingAds || []), ...(existingAds || [])]);
}

export const resolveFullUrl = (
  urlStr?: unknown,
  baseUrl?: string,
): string | undefined => {
  if (!urlStr || typeof urlStr !== "string") return undefined;
  const trimmed = urlStr.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (baseUrl) {
    try {
      const base = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
      return new URL(trimmed, base).toString();
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

export function getDomain(url?: string): string {
  if (!url || typeof url !== "string") return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

export function deduplicateStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    const lower = trimmed.toLowerCase();
    if (trimmed && !seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
  }
  return result;
}

export function normalizeKeywords(
  rawKeywords: unknown,
): BusinessProfileKeywords | undefined {
  if (!rawKeywords || typeof rawKeywords !== "object") return undefined;
  const kw = rawKeywords as Record<string, unknown>;

  const rawBroad = Array.isArray(kw.broadPhrases)
    ? kw.broadPhrases
    : Array.isArray(kw.broad)
      ? kw.broad
      : [];

  const broadPhrases = deduplicateStrings(
    rawBroad
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => k.trim()),
  ).slice(0, MAX_KEYWORDS_PER_LIST);

  const rawProduct = Array.isArray(kw.productOrServicePhrases)
    ? kw.productOrServicePhrases
    : Array.isArray(kw.productOrService)
      ? kw.productOrService
      : [];

  const productOrServicePhrases = deduplicateStrings(
    rawProduct
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => k.trim()),
  ).slice(0, MAX_KEYWORDS_PER_LIST);

  if (broadPhrases.length === 0 && productOrServicePhrases.length === 0) {
    return undefined;
  }

  return {
    broadPhrases: broadPhrases.length > 0 ? broadPhrases : undefined,
    productOrServicePhrases:
      productOrServicePhrases.length > 0 ? productOrServicePhrases : undefined,
  };
}

export function mergeKeywords(
  existing?: BusinessProfileKeywords,
  incoming?: BusinessProfileKeywords,
): BusinessProfileKeywords | undefined {
  const broad = deduplicateStrings([
    ...(existing?.broadPhrases || []),
    ...(incoming?.broadPhrases || []),
  ]).slice(0, MAX_KEYWORDS_PER_LIST);
  const product = deduplicateStrings([
    ...(existing?.productOrServicePhrases || []),
    ...(incoming?.productOrServicePhrases || []),
  ]).slice(0, MAX_KEYWORDS_PER_LIST);

  if (broad.length === 0 && product.length === 0) return undefined;
  return {
    broadPhrases: broad.length > 0 ? broad : undefined,
    productOrServicePhrases: product.length > 0 ? product : undefined,
  };
}

/**
 * Rebuild a competitor from the strict record shape. Stored profiles written
 * before competitor keywords were removed may still carry them; dropping the
 * unknown field here heals the record on the next save.
 */
function sanitizeCompetitor(
  competitor: CompetitorProfileItem,
): CompetitorProfileItem {
  return {
    name: competitor.name,
    ...(competitor.website ? { website: competitor.website } : {}),
    ...(competitor.logo ? { logo: competitor.logo } : {}),
    ...(competitor.overview ? { overview: competitor.overview } : {}),
    ads: normalizeCompetitorAds(competitor.ads),
  };
}

export function mergeCompetitorList(
  existingList: CompetitorProfileItem[],
  incomingList: CompetitorProfileItem[],
): CompetitorProfileItem[] {
  const result: CompetitorProfileItem[] = existingList
    .filter((competitor) => competitor && competitor.name)
    .map(sanitizeCompetitor);

  for (const inc of incomingList) {
    if (!inc || !inc.name) continue;
    const incName = inc.name.trim();
    const incDomain = getDomain(inc.website);

    const matchIndex = result.findIndex((ex) => {
      const exName = ex.name.trim().toLowerCase();
      const exDomain = getDomain(ex.website);

      if (incDomain && exDomain && incDomain === exDomain) return true;
      if (incName.toLowerCase() === exName) return true;
      return false;
    });

    if (matchIndex >= 0) {
      const existing = result[matchIndex];
      result[matchIndex] = {
        name: incName || existing.name,
        website: inc.website?.trim() || existing.website,
        logo: inc.logo
          ? resolveFullUrl(inc.logo, inc.website || existing.website)
          : existing.logo,
        overview:
          typeof inc.overview === "string" && inc.overview.trim()
            ? inc.overview.trim()
            : existing.overview,
        ads: mergeCompetitorAds(existing.ads, inc.ads),
      };
    } else {
      result.push({
        name: incName,
        website: inc.website?.trim() || undefined,
        logo: resolveFullUrl(inc.logo, inc.website),
        overview:
          typeof inc.overview === "string" && inc.overview.trim()
            ? inc.overview.trim()
            : undefined,
        ads: inc.ads || [],
      });
    }
  }

  return result;
}

export function normalizeBusinessProfilePayload(
  raw: unknown,
  fallbackUrl?: string,
): BusinessProfileConnectorSchema {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const url =
    (typeof data.url === "string" && data.url.trim()) || fallbackUrl || "";

  const rawBrand = (
    data.brand && typeof data.brand === "object" ? data.brand : {}
  ) as Record<string, unknown>;
  const rawTheme = (
    rawBrand.theme && typeof rawBrand.theme === "object" ? rawBrand.theme : {}
  ) as Record<string, unknown>;

  const brand: BusinessProfileBrand = {
    name:
      typeof rawBrand.name === "string" && rawBrand.name.trim()
        ? rawBrand.name.trim()
        : "Brand",
    overview:
      typeof rawBrand.overview === "string" ? rawBrand.overview.trim() : "",
    logoUrl: resolveFullUrl(rawBrand.logoUrl || rawBrand.logo, url) || null,
    fontNames: Array.isArray(rawBrand.fontNames)
      ? deduplicateStrings(rawBrand.fontNames)
      : undefined,
    fontUrls: Array.isArray(rawBrand.fontUrls)
      ? rawBrand.fontUrls
          .map((f) => resolveFullUrl(f, url))
          .filter((f): f is string => Boolean(f))
      : undefined,
    theme: {
      primary:
        (typeof rawTheme.primary === "string" && rawTheme.primary.trim()) ||
        "#1E3B33",
      primaryAccent:
        (typeof rawTheme.primaryAccent === "string" &&
          rawTheme.primaryAccent.trim()) ||
        (typeof rawTheme.accent === "string" && rawTheme.accent.trim()) ||
        "#E07A5F",
      otherAccents: Array.isArray(rawTheme.otherAccents)
        ? rawTheme.otherAccents.filter(
            (a): a is string => typeof a === "string" && a.trim().length > 0,
          )
        : undefined,
      secondary:
        typeof rawTheme.secondary === "string" && rawTheme.secondary.trim()
          ? rawTheme.secondary.trim()
          : undefined,
      background:
        (typeof rawTheme.background === "string" &&
          rawTheme.background.trim()) ||
        "#FAF5E8",
      foreground:
        (typeof rawTheme.foreground === "string" &&
          rawTheme.foreground.trim()) ||
        "#111827",
      radius:
        typeof rawTheme.radius === "string" && rawTheme.radius.trim()
          ? rawTheme.radius.trim()
          : undefined,
    },
    keywords:
      normalizeKeywords(rawBrand.keywords) ?? normalizeKeywords(data.keywords),
  };

  const rawGeo = (
    data.geography && typeof data.geography === "object" ? data.geography : {}
  ) as Record<string, unknown>;

  const countriesList: Country[] = [];
  if (Array.isArray(rawGeo.countries)) {
    for (const c of rawGeo.countries) {
      if (typeof c === "string" && c.trim()) {
        countriesList.push({ name: c.trim(), regions: [] });
      } else if (
        c &&
        typeof c === "object" &&
        typeof (c as Country).name === "string" &&
        (c as Country).name.trim()
      ) {
        countriesList.push({
          name: (c as Country).name.trim(),
          regions: Array.isArray((c as Country).regions)
            ? (c as Country).regions
            : [],
        });
      }
    }
  } else if (typeof rawGeo.country === "string" && rawGeo.country.trim()) {
    countriesList.push({ name: rawGeo.country.trim(), regions: [] });
  }

  const geography: BusinessProfileGeography = {
    scope:
      rawGeo.scope === "worldwide" || rawGeo.scope === "specific"
        ? rawGeo.scope
        : "nationwide",
    languages:
      Array.isArray(rawGeo.languages) && rawGeo.languages.length > 0
        ? deduplicateStrings(rawGeo.languages)
        : ["English"],
    countries:
      countriesList.length > 0
        ? countriesList
        : [{ name: "India", regions: [] }],
  };

  const rawComp = (
    data.competitors && typeof data.competitors === "object"
      ? data.competitors
      : {}
  ) as Record<string, unknown>;
  const rawList = Array.isArray(rawComp.competitors)
    ? rawComp.competitors
    : Array.isArray(rawComp.list)
      ? rawComp.list
      : [];

  const competitors: BusinessProfileCompetitors = {
    competitors: rawList.map((c: Record<string, unknown>) => {
      const website =
        typeof c?.website === "string" && c.website.trim()
          ? c.website.trim()
          : undefined;
      return {
        name:
          typeof c?.name === "string" && c.name.trim()
            ? c.name.trim()
            : "Competitor",
        website,
        logo: resolveFullUrl(c?.logo, website),
        overview:
          typeof c?.overview === "string" ? c.overview.trim() : undefined,
        // Competitor keywords are intentionally not stored: any phrases found
        // while profiling belong to the business's own capped keyword lists.
        ads: normalizeCompetitorAds(c?.ads),
      };
    }),
  };

  return { url, brand, geography, competitors };
}

export function mergeBusinessProfilePayload(
  existing: BusinessProfileConnectorSchema,
  incomingRaw: unknown,
): BusinessProfileConnectorSchema {
  const incoming = normalizeBusinessProfilePayload(incomingRaw, existing.url);

  const rawIncObj = (
    incomingRaw && typeof incomingRaw === "object" ? incomingRaw : {}
  ) as Record<string, unknown>;
  const rawIncBrand = (
    rawIncObj.brand && typeof rawIncObj.brand === "object"
      ? rawIncObj.brand
      : {}
  ) as Record<string, unknown>;
  const rawIncTheme = (
    rawIncBrand.theme && typeof rawIncBrand.theme === "object"
      ? rawIncBrand.theme
      : {}
  ) as Record<string, unknown>;
  const rawIncGeo = (
    rawIncObj.geography && typeof rawIncObj.geography === "object"
      ? rawIncObj.geography
      : {}
  ) as Record<string, unknown>;

  const mergedFonts = deduplicateStrings([
    ...(existing.brand.fontUrls || []),
    ...(incoming.brand.fontUrls || []),
  ]);

  const mergedFontNames = deduplicateStrings([
    ...(existing.brand.fontNames || []),
    ...(incoming.brand.fontNames || []),
  ]);

  const mergedOtherAccents = deduplicateStrings([
    ...(existing.brand.theme.otherAccents || []),
    ...(incoming.brand.theme.otherAccents || []),
  ]);

  const countryMap = new Map<string, Country>();
  for (const c of existing.geography?.countries || []) {
    countryMap.set(c.name.toLowerCase(), c);
  }
  for (const incC of incoming.geography?.countries || []) {
    const key = incC.name.toLowerCase();
    const ex = countryMap.get(key);
    countryMap.set(key, {
      name: incC.name,
      regions:
        incC.regions && incC.regions.length > 0
          ? incC.regions
          : ex?.regions || [],
    });
  }

  return {
    url: incoming.url || existing.url,
    brand: {
      name:
        typeof rawIncBrand.name === "string" && rawIncBrand.name.trim()
          ? rawIncBrand.name.trim()
          : existing.brand.name,
      overview: incoming.brand.overview || existing.brand.overview,
      logoUrl:
        rawIncBrand.logoUrl !== undefined || rawIncBrand.logo !== undefined
          ? incoming.brand.logoUrl
          : existing.brand.logoUrl,
      fontUrls: mergedFonts.length > 0 ? mergedFonts : undefined,
      fontNames: mergedFontNames.length > 0 ? mergedFontNames : undefined,
      theme: {
        primary: rawIncTheme.primary
          ? incoming.brand.theme.primary
          : existing.brand.theme.primary,
        primaryAccent:
          rawIncTheme.primaryAccent || rawIncTheme.accent
            ? incoming.brand.theme.primaryAccent
            : existing.brand.theme.primaryAccent,
        otherAccents:
          mergedOtherAccents.length > 0 ? mergedOtherAccents : undefined,
        secondary:
          rawIncTheme.secondary !== undefined
            ? incoming.brand.theme.secondary
            : existing.brand.theme.secondary,
        background: rawIncTheme.background
          ? incoming.brand.theme.background
          : existing.brand.theme.background,
        foreground: rawIncTheme.foreground
          ? incoming.brand.theme.foreground
          : existing.brand.theme.foreground,
        radius:
          rawIncTheme.radius !== undefined
            ? incoming.brand.theme.radius
            : existing.brand.theme.radius,
      },
      keywords: mergeKeywords(existing.brand.keywords, incoming.brand.keywords),
    },
    geography: {
      scope:
        (rawIncGeo.scope as "worldwide" | "nationwide" | "specific") ||
        existing.geography?.scope ||
        "nationwide",
      languages: deduplicateStrings([
        ...(existing.geography?.languages || []),
        ...(incoming.geography?.languages || []),
      ]),
      countries: Array.from(countryMap.values()),
    },
    competitors: {
      competitors: mergeCompetitorList(
        existing.competitors?.competitors || [],
        incoming.competitors?.competitors || [],
      ),
    },
  };
}
