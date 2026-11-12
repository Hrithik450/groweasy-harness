import { languages } from "countries-list";
// @ts-expect-error - @aryanjsx/knowindia has no bundled types
import knowIndia from "@aryanjsx/knowindia";
import { Country, State, City } from "country-state-city";

function getCountryIsoCode(countryName: string): string | undefined {
  if (!countryName) return undefined;
  const norm = countryName.trim().toLowerCase();
  if (norm === "india" || norm === "in") return "IN";
  return Country.getAllCountries().find((c) => c.name.toLowerCase() === norm)
    ?.isoCode;
}

/**
 * Returns all country names globally.
 * Sourced directly from `country-state-city`.
 */
export function getCountries(): string[] {
  return Country.getAllCountries()
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Returns spoken and official languages for a given country name.
 * - For India: Dynamically aggregated from `@aryanjsx/knowindia`.
 * - For other countries: Resolved using Intl locale mapping and `languages` dictionary.
 */
export function getLanguagesByCountry(countryName: string): string[] {
  const normalized = countryName.trim().toLowerCase();

  if (normalized === "india" || normalized === "in") {
    try {
      const statesMap = knowIndia.states("all");
      const languageSet = new Set<string>();

      for (const key of Object.keys(statesMap)) {
        const stateObj = statesMap[key];
        if (Array.isArray(stateObj?.officialLanguages)) {
          stateObj.officialLanguages.forEach((lang: string) =>
            languageSet.add(lang),
          );
        }
      }

      languageSet.add("English");
      return Array.from(languageSet).sort((a, b) => a.localeCompare(b));
    } catch {
      return ["English", "Hindi"];
    }
  }

  const found = Country.getAllCountries().find(
    (c) => c.name.toLowerCase() === normalized,
  );

  if (found) {
    const res = new Set<string>();
    try {
      const loc = new Intl.Locale(`und-${found.isoCode}`).maximize();
      const langCode = loc.language;
      if (langCode && languages[langCode as keyof typeof languages]) {
        res.add(languages[langCode as keyof typeof languages].name);
      } else if (langCode) {
        const dn = new Intl.DisplayNames(["en"], { type: "language" });
        const name = dn.of(langCode);
        if (name) res.add(name);
      }
    } catch {
    }
    res.add("English");
    return Array.from(res).sort((a, b) => a.localeCompare(b));
  }

  return ["English"];
}

/**
 * Returns spoken and official languages aggregated for multiple country names.
 */
export function getLanguagesForCountries(countryNames: string[]): string[] {
  if (!countryNames || countryNames.length === 0) return ["English"];
  const languageSet = new Set<string>();
  for (const name of countryNames) {
    const list = getLanguagesByCountry(name);
    for (const lang of list) {
      languageSet.add(lang);
    }
  }
  return Array.from(languageSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Returns all states/provinces/regions for ANY country in the world.
 * Sourced directly from `country-state-city` (browser-safe, in-memory dataset).
 */
export function getRegionsForCountry(countryName: string): string[] {
  if (!countryName) return [];
  const iso = getCountryIsoCode(countryName);
  if (!iso) return [countryName];
  const states = State.getStatesOfCountry(iso);
  if (!states || states.length === 0) return [countryName];
  return states.map((s) => s.name).sort((a, b) => a.localeCompare(b));
}

/**
 * Returns all cities/districts for ANY country and region in the world.
 * Sourced directly from `country-state-city` (browser-safe, in-memory dataset).
 */
export function getCitiesForRegion(
  countryName: string,
  regionName: string,
): string[] {
  if (!countryName || !regionName) return [];
  const iso = getCountryIsoCode(countryName);
  if (!iso) return [regionName];
  const states = State.getStatesOfCountry(iso);
  const state = states.find(
    (s) => s.name.toLowerCase() === regionName.trim().toLowerCase(),
  );
  if (!state) return [regionName];
  const cities = City.getCitiesOfState(iso, state.isoCode);
  if (!cities || cities.length === 0) return [regionName];
  return cities.map((c) => c.name).sort((a, b) => a.localeCompare(b));
}

/**
 * Returns areas/localities for a city.
 */
export function getAreasForCity(
  ..._args: unknown[]
): string[] {
  void _args;
  return [];
}
