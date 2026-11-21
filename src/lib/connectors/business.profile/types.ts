export interface BrandTheme {
  primary: string;
  primaryAccent: string;
  otherAccents?: string[];
  background?: string;
  secondary?: string;
  foreground?: string;
  typography?: string;
  radius?: string;
}

export interface BusinessProfileBrand {
  name: string;
  /** One-line tagline or concise brand summary. */
  description?: string;
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

/** One creative URL of a competitor ad. */
export interface CompetitorAdMedia {
  kind: "video" | "image";
  url: string;
}

/** One recent competitor ad, keyed by its Meta Ad Library ID. */
export interface CompetitorAd {
  /** Meta Ad Library ID; media follows from the scraper cache by this value. */
  id: string;
  /** Every creative URL captured for this ad. */
  media: CompetitorAdMedia[];
}

export interface CompetitorProfileItem {
  name: string;
  logo?: string;
  website?: string;
  overview?: string;
  ads?: CompetitorAd[];
}

export interface BusinessProfileCompetitors {
  competitors: CompetitorProfileItem[];
  content?: string;
}

export interface BusinessProfileKeywords {
  broadPhrases?: string[];
  productOrServicePhrases?: string[];
}

export interface BusinessProfileConnectorSchema {
  url: string;
  brand: BusinessProfileBrand;
  geography?: BusinessProfileGeography;
  competitors?: BusinessProfileCompetitors;
  keywords?: BusinessProfileKeywords;
}
