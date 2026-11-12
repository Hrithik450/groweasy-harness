import type { Country, Region, City, Area, FlatLocation } from "./types";

export function parseFlatLocations(countries?: Country[]): FlatLocation[] {
  if (!countries || countries.length === 0) return [];
  const list: FlatLocation[] = [];

  for (const c of countries) {
    for (const r of c.regions || []) {
      for (const city of r.cities || []) {
        if (city.areas && city.areas.length > 0) {
          for (const a of city.areas) {
            list.push({
              id: `${c.name}-${r.name}-${city.name}-${a.name}`,
              country: c.name,
              region: r.name,
              city: city.name,
              area: a.name,
              radiusKm: a.radiusKm || 5,
            });
          }
        } else {
          list.push({
            id: `${c.name}-${r.name}-${city.name}-All`,
            country: c.name,
            region: r.name,
            city: city.name,
            area: "All Areas",
            radiusKm: 5,
          });
        }
      }
    }
  }

  return list;
}

export function buildHierarchy(
  selectedCountries: string[],
  locations: FlatLocation[],
): Country[] {
  const result: Country[] = [];

  for (const cName of selectedCountries) {
    const locsForCountry = locations.filter(
      (loc) => loc.country.toLowerCase() === cName.toLowerCase(),
    );

    if (locsForCountry.length === 0) {
      result.push({ name: cName, regions: [] });
      continue;
    }

    const regionMap = new Map<string, Map<string, Area[]>>();
    for (const loc of locsForCountry) {
      if (!regionMap.has(loc.region)) {
        regionMap.set(loc.region, new Map());
      }
      const cityMap = regionMap.get(loc.region)!;
      if (!cityMap.has(loc.city)) {
        cityMap.set(loc.city, []);
      }
      if (loc.area && loc.area !== "All Areas") {
        cityMap.get(loc.city)!.push({
          name: loc.area,
          radiusKm: loc.radiusKm,
        });
      }
    }

    const regions: Region[] = [];
    for (const [regName, cityMap] of regionMap.entries()) {
      const cities: City[] = [];
      for (const [cityName, areas] of cityMap.entries()) {
        cities.push({
          name: cityName,
          ...(areas.length > 0 ? { areas } : {}),
        });
      }
      regions.push({
        name: regName,
        cities,
      });
    }

    result.push({ name: cName, regions });
  }

  return result;
}
