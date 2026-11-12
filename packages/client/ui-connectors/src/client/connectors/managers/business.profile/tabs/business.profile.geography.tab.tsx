"use client";

import { connectorsFetch } from "../../../../connectors.client";
import React, { useState, useRef, useEffect } from "react";
import {
  Globe,
  Languages,
  MapPin,
  Pencil,
  Check,
  Search,
  ChevronDown,
  Plus,
  Trash2,
  Loader2,
  X,
  Compass,
} from "lucide-react";
import { toast } from "sonner";
import { useModalEditActions } from "../../base.modal";
import {
  FlatLocation,
  parseFlatLocations,
  buildHierarchy,
  getCountries,
  getCitiesForRegion,
  getRegionsForCountry,
  getLanguagesForCountries,
  BusinessProfileGeography,
  BusinessProfileConnectorSchema,
} from "../../../../lib/business.profile";

const ALL_COUNTRIES = getCountries();

function SearchableDropdown<T extends string>({
  buttonLabel,
  disabled,
  searchPlaceholder,
  options,
  selected,
  onSelect,
  isMulti = false,
  isLoading = false,
  loadingText = "Loading...",
  prefixOption,
  className = "",
}: {
  buttonLabel: React.ReactNode;
  disabled?: boolean;
  searchPlaceholder?: string;
  options: T[];
  selected: T | T[];
  onSelect: (val: T) => void;
  isMulti?: boolean;
  isLoading?: boolean;
  loadingText?: string;
  prefixOption?: { label: string; value: T };
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;

  const isSelected = (val: T) =>
    isMulti ? (selected as T[]).includes(val) : selected === val;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setIsOpen((prev) => !prev);
          setSearch("");
        }}
        className="w-full flex items-center justify-between bg-card border border-border hover:border-input rounded-none px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors cursor-pointer disabled:bg-muted disabled:text-muted-foreground"
      >
        <span className="truncate">{buttonLabel}</span>
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 text-brand animate-spin shrink-0 ml-1" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1" />
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-none z-50 overflow-hidden">
          <div className="p-2 border-b border-border flex items-center gap-1.5 bg-muted">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder || "Search..."}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-muted-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto p-1 divide-y divide-border">
            {isLoading ? (
              <div className="p-3 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                <span>{loadingText}</span>
              </div>
            ) : (
              <>
                {prefixOption && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(prefixOption.value);
                      if (!isMulti) setIsOpen(false);
                      setSearch("");
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-none transition-colors cursor-pointer ${
                      isSelected(prefixOption.value)
                        ? "bg-brand/10 text-brand font-semibold"
                        : "text-foreground hover:bg-secondary font-medium"
                    }`}
                  >
                    <span>{prefixOption.label}</span>
                    {isSelected(prefixOption.value) && (
                      <Check className="w-3.5 h-3.5 text-brand shrink-0" />
                    )}
                  </button>
                )}
                {filtered.length > 0 ? (
                  filtered.map((item) => {
                    const active = isSelected(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          onSelect(item);
                          if (!isMulti) setIsOpen(false);
                          setSearch("");
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-none transition-colors cursor-pointer ${
                          active
                            ? "bg-brand/10 text-brand font-semibold"
                            : "text-foreground hover:bg-secondary font-medium"
                        }`}
                      >
                        <span className="truncate">{item}</span>
                        {active && (
                          <Check className="w-3.5 h-3.5 text-brand shrink-0" />
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    No options found
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Geography {
  countries: string[];
  languages: string[];
  scope: "worldwide" | "nationwide" | "specific";
  locations: FlatLocation[];
  builderCountry: string;
  pickerRegion: string;
  pickerCity: string;
  pickerArea: string;
  customAreaText: string;
  pickerRadius: number;
  customRadiusText: string;
}

const getInitialData = (
  initialGeography?: BusinessProfileGeography,
): Geography => {
  const countriesList = initialGeography?.countries
    ?.map((c) => c.name)
    .filter(Boolean);
  const countries =
    countriesList && countriesList.length > 0 ? countriesList : [];

  const languages =
    initialGeography?.languages && initialGeography.languages.length > 0
      ? initialGeography.languages
      : [];

  const locations = parseFlatLocations(initialGeography?.countries);
  const scope =
    initialGeography?.scope ||
    (locations.length > 0 ? "specific" : "nationwide");

  const builderCountry = countries[0] ?? "India";

  const regions = getRegionsForCountry(builderCountry);
  const pickerRegion = regions[0] ?? "";

  const cities = pickerRegion
    ? getCitiesForRegion(builderCountry, pickerRegion)
    : [];
  const pickerCity = cities[0] ?? "";

  return {
    countries,
    languages,
    scope,
    locations,
    builderCountry,
    pickerRegion,
    pickerCity,
    pickerArea: "",
    customAreaText: "",
    pickerRadius: 5,
    customRadiusText: "",
  };
};

interface BusinessProfileGeographyTabProps {
  data: BusinessProfileConnectorSchema;
  onSave?: (updatedGeography: BusinessProfileGeography) => Promise<void>;
}

export function BusinessProfileGeographyTab({
  data,
  onSave,
}: BusinessProfileGeographyTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [geography, setGeography] = useState<Geography>(() =>
    getInitialData(data.geography),
  );

  const updateGeography = (patch: Partial<Geography>) => {
    setGeography((prev) => ({ ...prev, ...patch }));
  };

  const isPanIndia =
    geography.countries.length === 1 &&
    geography.countries[0]?.toLowerCase() === "india";

  const nationwideScopeTitle = isPanIndia ? "Pan India" : "Nationwide";

  const nationwideScopeDesc = isPanIndia
    ? "Target nationwide across all of India."
    : "Target nationwide across all selected operating countries.";

  const availableLanguages = getLanguagesForCountries(geography.countries);

  const availableRegions = getRegionsForCountry(geography.builderCountry);

  const availableCities =
    geography.builderCountry && geography.pickerRegion
      ? getCitiesForRegion(geography.builderCountry, geography.pickerRegion)
      : [];

  const [loadedAreas, setLoadedAreas] = useState<string[]>([]);
  const currentAreaKey = `${geography.builderCountry}:${geography.pickerRegion}:${geography.pickerCity}`;
  const [loadedAreaKey, setLoadedAreaKey] = useState<string>("");

  const isLoadingAreas =
    geography.builderCountry.toLowerCase() === "india" &&
    Boolean(geography.pickerCity) &&
    loadedAreaKey !== currentAreaKey;

  useEffect(() => {
    if (
      !geography.pickerCity ||
      geography.builderCountry.toLowerCase() !== "india"
    ) {
      return;
    }

    const key = `${geography.builderCountry}:${geography.pickerRegion}:${geography.pickerCity}`;
    let isMounted = true;
    connectorsFetch(
      `/api/connectors/business.profile/areas?city=${encodeURIComponent(geography.pickerCity)}&state=${encodeURIComponent(geography.pickerRegion)}`,
    )
      .then((res) => res.json())
      .then((resData) => {
        if (isMounted && resData.success && Array.isArray(resData.areas)) {
          setLoadedAreas(resData.areas);
        }
      })
      .catch(() => {
        if (isMounted) setLoadedAreas([]);
      })
      .finally(() => {
        if (isMounted) setLoadedAreaKey(key);
      });

    return () => {
      isMounted = false;
    };
  }, [geography.builderCountry, geography.pickerCity, geography.pickerRegion]);

  const availableAreas =
    geography.pickerCity &&
    geography.builderCountry.toLowerCase() === "india" &&
    loadedAreaKey === currentAreaKey
      ? loadedAreas
      : [];

  const handleToggleCountry = (c: string) => {
    const exists = geography.countries.includes(c);
    if (exists && geography.countries.length === 1) {
      toast.info("At least one operating country must remain selected");
      return;
    }
    const updatedCountries = exists
      ? geography.countries.filter((item) => item !== c)
      : [...geography.countries, c];
    const newLangs = getLanguagesForCountries(updatedCountries);
    const keptLangs = geography.languages.filter((l) => newLangs.includes(l));
    const nextBuilderCountry = updatedCountries.includes(
      geography.builderCountry,
    )
      ? geography.builderCountry
      : updatedCountries[0] || "India";

    const nextRegions = getRegionsForCountry(nextBuilderCountry);
    const nextRegion = nextRegions.includes(geography.pickerRegion)
      ? geography.pickerRegion
      : nextRegions[0] || "";
    const nextCities = nextRegion
      ? getCitiesForRegion(nextBuilderCountry, nextRegion)
      : [];
    const nextCity = nextCities.includes(geography.pickerCity)
      ? geography.pickerCity
      : nextCities[0] || "";

    updateGeography({
      countries: updatedCountries,
      languages: keptLangs.length > 0 ? keptLangs : [newLangs[0] || "English"],
      builderCountry: nextBuilderCountry,
      pickerRegion: nextRegion,
      pickerCity: nextCity,
    });
  };

  const handleToggleLanguage = (lang: string) => {
    const exists = geography.languages.includes(lang);
    if (exists && geography.languages.length === 1) {
      toast.info("At least one target language must remain selected");
      return;
    }
    updateGeography({
      languages: exists
        ? geography.languages.filter((l) => l !== lang)
        : [...geography.languages, lang],
    });
  };

  const handleSelectBuilderCountry = (c: string) => {
    const nextRegions = getRegionsForCountry(c);
    const nextRegion = nextRegions[0] || "";
    const nextCities = nextRegion ? getCitiesForRegion(c, nextRegion) : [];
    const nextCity = nextCities[0] || "";
    updateGeography({
      builderCountry: c,
      pickerRegion: nextRegion,
      pickerCity: nextCity,
      pickerArea: "",
      customAreaText: "",
    });
  };

  const handleSelectRegion = (r: string) => {
    const nextCities = getCitiesForRegion(geography.builderCountry, r);
    const nextCity = nextCities[0] || "";
    updateGeography({
      pickerRegion: r,
      pickerCity: nextCity,
      pickerArea: "",
      customAreaText: "",
    });
  };

  const handleSelectCity = (city: string) => {
    updateGeography({
      pickerCity: city,
      pickerArea: "",
      customAreaText: "",
    });
  };

  const handleCustomRadiusChange = (val: string) => {
    if (!val) {
      updateGeography({ customRadiusText: "" });
      return;
    }
    const num = Number(val);
    if (isNaN(num)) return;
    if (num > 100) {
      toast.error("Radius cannot exceed 100 km");
      updateGeography({ customRadiusText: "100" });
      return;
    }
    if (num < 1) {
      updateGeography({ customRadiusText: "1" });
      return;
    }
    updateGeography({ customRadiusText: val });
  };

  const handleAddLocation = () => {
    const {
      builderCountry,
      pickerRegion,
      pickerCity,
      pickerArea,
      customAreaText,
      pickerRadius,
      customRadiusText,
      locations,
    } = geography;

    if (!builderCountry) {
      toast.error("Please select an operating country");
      return;
    }
    if (!pickerRegion?.trim()) {
      toast.error("Please select or enter a state / region");
      return;
    }
    if (!pickerCity?.trim()) {
      toast.error("Please select or enter a city / district");
      return;
    }

    const finalArea = customAreaText.trim() || pickerArea || "All Areas";
    const customRad = Number(customRadiusText);
    const finalRadius =
      customRadiusText.trim() !== "" ? customRad : pickerRadius;

    if (isNaN(finalRadius) || finalRadius < 1 || finalRadius > 100) {
      toast.error("Radius must be between 1 km and 100 km");
      return;
    }

    const exists = locations.some(
      (loc) =>
        loc.country.toLowerCase() === builderCountry.toLowerCase() &&
        loc.region.toLowerCase() === pickerRegion.trim().toLowerCase() &&
        loc.city.toLowerCase() === pickerCity.trim().toLowerCase() &&
        loc.area.toLowerCase() === finalArea.toLowerCase(),
    );

    if (exists) {
      toast.info("This location has already been added");
      return;
    }

    const newLoc: FlatLocation = {
      id: `${builderCountry}-${pickerRegion.trim()}-${pickerCity.trim()}-${finalArea}`,
      country: builderCountry,
      region: pickerRegion.trim(),
      city: pickerCity.trim(),
      area: finalArea,
      radiusKm: finalRadius,
    };

    updateGeography({
      locations: [...locations, newLoc],
      customAreaText: "",
      customRadiusText: "",
    });

    toast.success(
      `Added ${builderCountry} › ${pickerCity.trim()} · ${finalArea} (${finalRadius} km)`,
    );
  };

  const handleRemoveLocation = (id: string) => {
    updateGeography({
      locations: geography.locations.filter((l) => l.id !== id),
    });
  };

  const handleCancel = () => {
    setGeography(getInitialData(data.geography));
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (geography.countries.length === 0) {
      toast.error("Please select at least one operating country");
      return;
    }
    if (geography.languages.length === 0) {
      toast.error("Please select at least one target language");
      return;
    }
    if (geography.scope === "specific" && geography.locations.length === 0) {
      toast.error(
        `Please add at least one target location or select ${nationwideScopeTitle} / Worldwide`,
      );
      return;
    }

    setIsSaving(true);
    try {
      const updatedCountries = buildHierarchy(
        geography.countries,
        geography.locations,
      );
      const updatedGeography: BusinessProfileGeography = {
        scope: geography.scope,
        languages: geography.languages,
        countries: updatedCountries,
      };

      await onSave?.(updatedGeography);
      toast.success("Geography settings saved successfully");
      setIsEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  useModalEditActions(
    isEditing
      ? {
          isEditing: true,
          onSave: handleSave,
          onCancel: handleCancel,
          isSaving,
        }
      : null,
  );

  const countryMap = new Map<
    string,
    Map<string, Map<string, FlatLocation[]>>
  >();

  for (const loc of geography.locations) {
    if (!countryMap.has(loc.country)) {
      countryMap.set(loc.country, new Map());
    }
    const regMap = countryMap.get(loc.country)!;
    if (!regMap.has(loc.region)) {
      regMap.set(loc.region, new Map());
    }
    const cityMap = regMap.get(loc.region)!;
    if (!cityMap.has(loc.city)) {
      cityMap.set(loc.city, []);
    }
    cityMap.get(loc.city)!.push(loc);
  }

  const scopeOptions = [
    {
      id: "worldwide" as const,
      title: "Worldwide",
      desc: "Target global audiences everywhere across all countries.",
    },
    {
      id: "nationwide" as const,
      title: nationwideScopeTitle,
      desc: nationwideScopeDesc,
    },
    {
      id: "specific" as const,
      title: "Specific Cities",
      desc: "Pinpoint states, cities, and neighborhood radius zones.",
    },
  ];

  if (!isEditing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-0.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <MapPin className="w-3.5 h-3.5 text-brand" />
            <span>Geographic Profile</span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors cursor-pointer"
          >
            <Pencil className="w-3 h-3 text-muted-foreground" />
            <span>Edit Geography</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Countries Card */}
          <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-border">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Globe className="w-3.5 h-3.5 text-brand" />
                <span>Operating Countries</span>
              </div>
              <span className="text-[11px] text-foreground font-medium px-2 py-0.5 rounded-none bg-card border border-border">
                {geography.countries.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {geography.countries.map((c) => (
                <span
                  key={c}
                  className="px-2.5 py-1 rounded-none text-xs font-medium bg-card border border-border text-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Languages Card */}
          <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-border">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Languages className="w-3.5 h-3.5 text-brand" />
                <span>Target Languages</span>
              </div>
              <span className="text-[11px] text-foreground font-medium px-2 py-0.5 rounded-none bg-card border border-border">
                {geography.languages.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {geography.languages.map((lang) => (
                <span
                  key={lang}
                  className="px-2.5 py-1 rounded-none text-xs font-medium bg-card border border-border text-foreground"
                >
                  {lang}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Cities & Areas Card */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <MapPin className="w-3.5 h-3.5 text-brand" />
              <span>Target Cities &amp; Areas</span>
            </div>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-none bg-card border border-border text-foreground">
              {geography.scope === "worldwide"
                ? "Worldwide"
                : geography.scope === "nationwide"
                  ? nationwideScopeTitle
                  : `${geography.locations.length} Locations`}
            </span>
          </div>

          {geography.scope === "worldwide" ? (
            <div className="flex items-start gap-2.5 pt-1">
              <Compass className="w-4 h-4 text-brand mt-0.5 shrink-0" />
              <div className="text-xs text-foreground leading-relaxed">
                <span className="font-semibold text-foreground">
                  Worldwide Targeting Active:
                </span>{" "}
                Ad campaigns and content will target audiences globally across
                all international regions.
              </div>
            </div>
          ) : geography.scope === "nationwide" ? (
            <div className="flex items-start gap-2.5 pt-1">
              <Compass className="w-4 h-4 text-brand mt-0.5 shrink-0" />
              <div className="text-xs text-foreground leading-relaxed">
                <span className="font-semibold text-foreground">
                  {isPanIndia
                    ? "Pan India Targeting Active:"
                    : "Nationwide Targeting Active:"}
                </span>{" "}
                {nationwideScopeDesc}
              </div>
            </div>
          ) : geography.locations.length > 0 ? (
            <div className="space-y-3 pt-0.5">
              {Array.from(countryMap.entries()).map(
                ([countryName, regMap]) => (
                  <div key={countryName} className="space-y-2.5">
                    <div className="flex items-center justify-between pb-1 border-b border-border">
                      <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-brand" />
                        <span>{countryName}</span>
                      </div>
                    </div>

                    <div className="space-y-2 pl-1">
                      {Array.from(regMap.entries()).map(
                        ([regName, cityMap]) => (
                          <div key={regName} className="space-y-1.5">
                            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-none bg-brand" />
                              <span>{regName}</span>
                            </div>

                            <div className="pl-3 space-y-1.5 border-l-2 border-border">
                              {Array.from(cityMap.entries()).map(
                                ([cityName, locs]) => (
                                  <div key={cityName} className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground">
                                      {cityName}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {locs.map((loc) => (
                                        <span
                                          key={loc.id}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs bg-card border border-border text-foreground"
                                        >
                                          <span className="font-medium">
                                            {loc.area}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-none font-mono">
                                            {loc.radiusKm} km
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic py-2 text-center">
              No specific locations configured. Click Edit Geography above to
              add target locations.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-0.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <MapPin className="w-3.5 h-3.5 text-brand" />
          <span>Edit Geographic Profile</span>
        </div>
      </div>

      {/* Top 2 Cards: Countries & Languages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Operating Countries */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Globe className="w-3.5 h-3.5 text-brand" />
              <span>Operating Countries</span>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground bg-card border border-border px-2 py-0.5 rounded-none">
              {geography.countries.length} Selected
            </span>
          </div>

          <SearchableDropdown
            isMulti
            buttonLabel={
              geography.countries.length > 0
                ? geography.countries.join(", ")
                : "Select Countries..."
            }
            searchPlaceholder="Search country..."
            options={ALL_COUNTRIES}
            selected={geography.countries}
            onSelect={handleToggleCountry}
          />
        </div>

        {/* Target Languages */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Languages className="w-3.5 h-3.5 text-brand" />
              <span>Target Languages</span>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground bg-card border border-border px-2 py-0.5 rounded-none">
              {geography.languages.length} Selected
            </span>
          </div>

          <SearchableDropdown
            isMulti
            buttonLabel={
              geography.languages.length > 0
                ? geography.languages.join(", ")
                : "Select Languages..."
            }
            searchPlaceholder="Search languages..."
            options={availableLanguages}
            selected={geography.languages}
            onSelect={handleToggleLanguage}
          />
        </div>
      </div>

      {/* Targeting Scope & Cascading Location Builder */}
      <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-4">
        <div className="pb-1.5 border-b border-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <MapPin className="w-3.5 h-3.5 text-brand" />
            <span>Targeting Scope</span>
          </div>
        </div>

        {/* 3 Scope Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {scopeOptions.map((opt) => {
            const isSelected = geography.scope === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateGeography({ scope: opt.id })}
                className={`p-3 rounded-none border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "bg-brand/5 border-brand ring-1 ring-brand"
                    : "bg-card border-border hover:border-input"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-3.5 h-3.5 rounded-none border flex items-center justify-center ${
                      isSelected ? "border-brand" : "border-input"
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-none bg-brand" />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    {opt.title}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground pl-5.5 leading-relaxed">
                  {opt.desc}
                </p>
              </button>
            );
          })}
        </div>

        {/* Location Builder */}
        {geography.scope === "specific" && (
          <div className="bg-card border border-border rounded-none p-3.5 space-y-3">
            <div className="text-xs font-semibold text-foreground">
              Add Target Location
            </div>

            {/* Row 1: Country Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Operating Country
              </label>
              <SearchableDropdown
                buttonLabel={geography.builderCountry}
                searchPlaceholder="Select country..."
                options={geography.countries}
                selected={geography.builderCountry}
                onSelect={handleSelectBuilderCountry}
              />
            </div>

            {/* Row 2: Region & City Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  1. State / Region
                </label>
                <SearchableDropdown
                  disabled={availableRegions.length === 0}
                  buttonLabel={
                    geography.pickerRegion || "Select State / Region..."
                  }
                  searchPlaceholder="Search state / region..."
                  options={availableRegions}
                  selected={geography.pickerRegion}
                  onSelect={handleSelectRegion}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  2. City / District
                </label>
                <SearchableDropdown
                  disabled={availableCities.length === 0}
                  buttonLabel={
                    geography.pickerCity || "Select City / District..."
                  }
                  searchPlaceholder="Search city / district..."
                  options={availableCities}
                  selected={geography.pickerCity}
                  onSelect={handleSelectCity}
                />
              </div>
            </div>

            {/* Row 3: Area & Radius */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Area */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  3. Area / Locality (Optional)
                </label>
                {availableAreas.length > 0 || isLoadingAreas ? (
                  <SearchableDropdown
                    isLoading={isLoadingAreas}
                    loadingText="Loading localities..."
                    buttonLabel={
                      isLoadingAreas
                        ? "Loading areas..."
                        : geography.customAreaText ||
                          geography.pickerArea ||
                          "Select or type area..."
                    }
                    searchPlaceholder="Search or enter area..."
                    options={availableAreas}
                    selected={geography.pickerArea}
                    prefixOption={{
                      label: "All Areas (Entire city)",
                      value: "All Areas",
                    }}
                    onSelect={(area) =>
                      updateGeography({ pickerArea: area, customAreaText: "" })
                    }
                  />
                ) : (
                  <input
                    type="text"
                    value={geography.customAreaText}
                    onChange={(e) =>
                      updateGeography({ customAreaText: e.target.value })
                    }
                    placeholder="Enter locality / neighborhood (optional)..."
                    className="w-full bg-card border border-border rounded-none px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-input"
                  />
                )}
              </div>

              {/* Radius */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  4. Radius (km)
                </label>
                <div className="flex items-center gap-1.5">
                  {[2, 5, 15].map((rad) => {
                    const isSelected =
                      !geography.customRadiusText &&
                      geography.pickerRadius === rad;
                    return (
                      <button
                        key={rad}
                        type="button"
                        onClick={() =>
                          updateGeography({
                            pickerRadius: rad,
                            customRadiusText: "",
                          })
                        }
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-none border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-brand text-primary-foreground border-brand"
                            : "bg-card text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {rad} km
                      </button>
                    );
                  })}
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={geography.customRadiusText}
                    onChange={(e) => handleCustomRadiusChange(e.target.value)}
                    placeholder="Custom"
                    className="w-18 bg-card border border-border rounded-none px-2 py-1.5 text-xs text-center text-foreground focus:outline-none focus:border-input"
                  />
                </div>
              </div>
            </div>

            {/* Add Location Button */}
            <button
              type="button"
              onClick={handleAddLocation}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-brand hover:bg-brand-hover text-primary-foreground text-xs font-semibold rounded-none transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Location</span>
            </button>
          </div>
        )}

        {/* Configured Locations List */}
        {geography.scope === "specific" && geography.locations.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span>Configured Locations ({geography.locations.length})</span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {geography.locations.map((loc) => (
                <div
                  key={loc.id}
                  className="flex items-center justify-between bg-card border border-border rounded-none px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <MapPin className="w-3.5 h-3.5 text-brand shrink-0" />
                    <span className="font-semibold text-foreground">
                      {loc.city}, {loc.region} ({loc.country})
                    </span>
                    <span className="text-muted-foreground">›</span>
                    <span className="text-foreground truncate">{loc.area}</span>
                    <span className="text-[10px] text-muted-foreground bg-secondary border border-border px-1.5 py-0.5 rounded-none font-mono shrink-0">
                      {loc.radiusKm} km
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveLocation(loc.id)}
                    className="p-1 text-muted-foreground hover:text-destructive rounded-none transition-colors cursor-pointer shrink-0 ml-2"
                    title="Remove location"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
