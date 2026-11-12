export interface BrandTheme {
  primary: string;
  primaryAccent: string;
  otherAccents?: string[];
  background?: string;
  secondary?: string;
  foreground?: string;
  radius?: string;
}

export interface BusinessProfileKeywords {
  broadPhrases?: string[];
  productOrServicePhrases?: string[];
}

export interface BusinessProfileBrand {
  name: string;
  overview: string;
  logoUrl?: string | null;
  fontUrls?: string[];
  fontNames?: string[];
  theme: BrandTheme;
  keywords?: BusinessProfileKeywords;
}

export interface Area {
  name: string;
  radiusKm: number;
}

export interface FlatLocation {
  id: string;
  country: string;
  region: string;
  city: string;
  area: string;
  radiusKm: number;
}

export interface City {
  name: string;
  areas?: Area[];
}

export interface Region {
  name: string;
  cities?: City[];
}

export interface Country {
  name: string;
  regions?: Region[];
}

export interface BusinessProfileGeography {
  scope?: "worldwide" | "nationwide" | "specific";
  languages?: string[];
  countries?: Country[];
}

export type CompetitorAdFormat = "video" | "static";

/**
 * One recent competitor ad. Ads are merged into the business's own keyword
 * lists, never stored with keywords of their own.
 */
export interface CompetitorAd {
  /** Creative format; the UI picks the video player or the image block. */
  format: CompetitorAdFormat;
  /** Meta Ad Library URL the collector returned, used as-is. */
  adUrl: string;
  /** Collector-supplied creative media URL(s), used as-is. */
  mediaUrls?: string[];
  /** Short ad label/copy when the collector provides one. */
  label?: string;
}

export interface CompetitorProfileItem {
  name: string;
  logo?: string;
  website?: string;
  overview?: string;
  /** Recent ads; empty when the competitor runs none. */
  ads: CompetitorAd[];
}

export interface BusinessProfileCompetitors {
  competitors: CompetitorProfileItem[];
  content?: string;
}

export interface BusinessProfileConnectorSchema {
  url: string;
  brand: BusinessProfileBrand;
  geography?: BusinessProfileGeography;
  competitors?: BusinessProfileCompetitors;
}

