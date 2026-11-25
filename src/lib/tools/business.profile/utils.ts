import { isCompetitorAdMedia } from "@/lib/connectors/business.profile";
import type {
  CompetitorAd,
  CompetitorAdMedia,
  CompetitorProfileItem,
  BusinessProfileConnectorSchema,
  BusinessProfileBrand,
  BusinessProfileGeography,
  BusinessProfileCompetitors,
  BusinessProfileKeywords,
  Country,
} from "@/lib/connectors/business.profile";
import { getScrapedAdsByIds } from "@/lib/meta.ad.library/ad.scraper";

/** One submitted ad, keyed by its Meta Ad Library ID. */
/**
 * Normalize submitted ads. Provided creative URLs are validated; when an ad
 * has none, the scraper cache fills them from its library ID.
 */
export function normalizeCompetitorAds(raw: unknown): CompetitorAd[] {
  if (!Array.isArray(raw)) return [];

  const byId = new Map<string, CompetitorAdMedia[]>();
  for (const item of raw) {
    const record = (item && typeof item === "object" ? item : {}) as {
      id?: unknown;
      media?: unknown;
    };
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) continue;

    const media = (Array.isArray(record.media) ? record.media : []).filter(
      isCompetitorAdMedia,
    );
    byId.set(id, [...(byId.get(id) ?? []), ...media]);
  }

  if (byId.size === 0) return [];

  const stored = getScrapedAdsByIds([...byId.keys()]);
  return [...byId.entries()].flatMap(([id, media]) => {
    const cached = stored.get(id);
    const resolved =
      media.length > 0
        ? media
        : [
            ...(cached?.media?.videos ?? []).map((url) => ({
              kind: "video" as const,
              url,
            })),
            ...(cached?.media?.images ?? []).map((url) => ({
              kind: "image" as const,
              url,
            })),
          ].filter(isCompetitorAdMedia);

    // No validated media and no cached ad means there is nothing to save.
    if (!cached && resolved.length === 0) return [];

    const seen = new Set<string>();
    return [
      {
        id,
        media: resolved
          .filter((m) => {
            const url = m.url.trim();
            if (seen.has(url)) return false;
            seen.add(url);
            return true;
          })
          .map((m) => ({ kind: m.kind, url: m.url.trim() })),
      },
    ];
  });
}

/** Merge two ad lists by library ID, keeping every creative URL once. */
export function mergeCompetitorAds(
  existing: CompetitorAd[] = [],
  incoming: CompetitorAd[] = [],
): CompetitorAd[] {
  return normalizeCompetitorAds([...existing, ...incoming]);
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
  );

  const rawProduct = Array.isArray(kw.productOrServicePhrases)
    ? kw.productOrServicePhrases
    : Array.isArray(kw.productOrService)
      ? kw.productOrService
      : [];

  const productOrServicePhrases = deduplicateStrings(
    rawProduct
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => k.trim()),
  );

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
  ]);
  const product = deduplicateStrings([
    ...(existing?.productOrServicePhrases || []),
    ...(incoming?.productOrServicePhrases || []),
  ]);

  if (broad.length === 0 && product.length === 0) return undefined;
  return {
    broadPhrases: broad.length > 0 ? broad : undefined,
    productOrServicePhrases: product.length > 0 ? product : undefined,
  };
}

export function mergeCompetitorList(
  existingList: CompetitorProfileItem[],
  incomingList: CompetitorProfileItem[],
): CompetitorProfileItem[] {
  const result: CompetitorProfileItem[] = [...existingList];

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
        ads: normalizeCompetitorAds(inc.ads),
      });
    }
  }

  return result;
}

/**
 * Fallback palette for a brand whose site exposes no usable theme.
 *
 * Literal colours, not theme tokens: these values are stored as brand data,
 * rendered as swatches, copied to the clipboard, and printed into the
 * model-facing profile, so they must be real colours rather than CSS vars.
 */
const DEFAULT_BRAND_THEME = {
  primary: "#1e3b33",
  primaryAccent: "#e07a5f",
  background: "#faf5e8",
  foreground: "#111827",
} as const;

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
        DEFAULT_BRAND_THEME.primary,
      primaryAccent:
        (typeof rawTheme.primaryAccent === "string" &&
          rawTheme.primaryAccent.trim()) ||
        (typeof rawTheme.accent === "string" && rawTheme.accent.trim()) ||
        DEFAULT_BRAND_THEME.primaryAccent,
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
        DEFAULT_BRAND_THEME.background,
      foreground:
        (typeof rawTheme.foreground === "string" &&
          rawTheme.foreground.trim()) ||
        DEFAULT_BRAND_THEME.foreground,
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

  // Countries: merge by lowercase name, preserving granular regions if incoming is unspecified
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

/**
 * Merge a UI patch into a stored profile.
 *
 * Brand merges field-by-field (keywords stay additive). Geography and
 * competitors are replaced when the patch includes them, so removing a row in
 * the modal sticks; omitting a section keeps the stored one.
 */
export function mergeBusinessProfilePatch(
  existing: BusinessProfileConnectorSchema,
  incomingRaw: unknown,
): BusinessProfileConnectorSchema {
  const incoming = normalizeBusinessProfilePayload(incomingRaw, existing.url);
  const brand = mergeBusinessProfilePayload(existing, incomingRaw).brand;
  const has = (key: string) =>
    typeof incomingRaw === "object" &&
    incomingRaw !== null &&
    Object.prototype.hasOwnProperty.call(incomingRaw, key);

  return {
    url: incoming.url || existing.url,
    brand,
    geography: has("geography") ? incoming.geography : existing.geography,
    competitors: has("competitors")
      ? incoming.competitors
      : existing.competitors,
  };
}
