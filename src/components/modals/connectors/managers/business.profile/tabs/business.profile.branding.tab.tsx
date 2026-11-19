"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ExternalLink,
  FileText,
  Palette,
  Type,
  Check,
  Copy,
  Layers,
  Tag,
} from "lucide-react";
import { getCompetitorInitials } from "./business.profile.competitors.tab";
import { markdownComponents } from "@/components/utils";
import type {
  BusinessProfileBrand,
  BusinessProfileConnectorSchema,
  BrandTheme,
} from "@/lib/connectors/business.profile";

export function BusinessProfileGuidelinesSection({
  data,
}: {
  data: BusinessProfileConnectorSchema;
}) {
  const { brand } = data;
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  if (!brand) return null;

  const theme: BrandTheme | null =
    typeof brand.theme === "object" && brand.theme !== null
      ? brand.theme
      : null;

  const legacyThemeString =
    typeof brand.theme === "string" ? brand.theme : null;

  const colors = [
    { label: "Primary", value: theme?.primary, desc: "Dominant brand tone" },
    {
      label: "Accent",
      value: theme?.primaryAccent,
      desc: "High-contrast CTA & highlight",
    },
    ...(theme?.otherAccents || []).map((hex, idx) => ({
      label: `Accent ${idx + 2}`,
      value: hex,
      desc: "Secondary accent",
    })),
    { label: "Secondary", value: theme?.secondary, desc: "Supporting element" },
    {
      label: "Background",
      value: theme?.background,
      desc: "Surface & canvas base",
    },
    {
      label: "Foreground",
      value: theme?.foreground,
      desc: "Typography & high-contrast content",
    },
  ].filter(
    (c): c is { label: string; value: string; desc: string } =>
      typeof c.value === "string" && c.value.trim().length > 0,
  );

  const handleCopy = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1500);
  };

  return (
    <div className="space-y-3">
      {/* Brand Color System */}
      <div className="bg-linen border border-border/80 rounded-2xl p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between pb-1.5 border-b border-border/60 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-forest" />
            <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
              Color System &amp; Palette
            </h4>
          </div>
          <span className="text-[11px] text-foreground font-medium px-2 py-0.5 rounded-none bg-card border border-border/80 shadow-2xs">
            Click any swatch to copy HEX
          </span>
        </div>

        {colors.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {colors.map((color) => {
              const isCopied = copiedHex === color.value;
              return (
                <button
                  key={color.label}
                  type="button"
                  onClick={() => handleCopy(color.value)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-card hover:bg-linen/80 hover:border-border-strong transition-all text-left group cursor-pointer shadow-2xs relative"
                >
                  <div
                    className="w-8 h-8 rounded-lg border border-border/80 shrink-0 shadow-2xs flex items-center justify-center transition-transform group-hover:scale-105"
                    style={{ backgroundColor: color.value }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono text-muted-2 block leading-tight font-semibold">
                        {color.label}
                      </span>
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-success-strong shrink-0" />
                      ) : (
                        <Copy className="w-3 h-3 text-muted-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                    <span className="text-xs font-mono font-bold text-foreground truncate block mt-0.5">
                      {color.value}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground truncate block leading-tight mt-0.5">
                      {color.desc}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : legacyThemeString ? (
          <p className="text-xs text-foreground bg-card p-3 rounded-xl border border-border/80 shadow-2xs">
            {legacyThemeString}
          </p>
        ) : (
          <p className="text-xs text-muted-2 italic py-2">
            No colors extracted.
          </p>
        )}
      </div>

      {/* Typography & Shape Specifications */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Typography */}
        <div className="bg-linen border border-border/80 rounded-2xl p-3.5 sm:p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-forest" />
              <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
                Typography
              </h4>
            </div>
          </div>

          <div className="space-y-2 pt-0.5">
            <div>
              <span className="text-[10px] uppercase font-mono text-muted-2 block font-semibold">
                Typography Font Families
              </span>
              {Array.isArray(brand.fontNames) && brand.fontNames.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {brand.fontNames.map((fontName, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] font-medium text-foreground bg-card px-2 py-0.5 rounded-md border border-border/80 shadow-2xs"
                    >
                      {fontName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs sm:text-sm font-semibold text-foreground mt-0.5">
                  Modern Sans-Serif
                </p>
              )}
            </div>

            {Array.isArray(brand.fontUrls) && brand.fontUrls.length > 0 && (
              <div className="pt-2 border-t border-border/60 space-y-1">
                <span className="text-[10px] uppercase font-mono text-muted-2 block font-semibold">
                  Web Font Resources
                </span>
                <div className="space-y-1">
                  {brand.fontUrls.map((font, idx) => (
                    <span
                      key={idx}
                      
                      
                      
                      className="text-xs text-forest hover:underline flex items-center gap-1 truncate font-mono bg-card px-2.5 py-1.5 rounded-lg border border-border/80 shadow-2xs"
                    >
                      <span className="truncate">{font}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Shape & Corner Radius */}
        <div className="bg-linen border border-border/80 rounded-2xl p-3.5 sm:p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-forest" />
              <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
                Corner Radius &amp; Geometry
              </h4>
            </div>
          </div>

          <div className="space-y-2 pt-0.5">
            <div>
              <span className="text-[10px] uppercase font-mono text-muted-2 block font-semibold">
                Average Surface Radius
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono font-semibold bg-card text-foreground px-2.5 py-1 rounded-lg border border-border/80 shadow-2xs">
                  {theme?.radius || "0.75rem (Rounded)"}
                </span>
                <div
                  className="w-6 h-6 border-2 border-forest bg-forest/10"
                  style={{ borderRadius: theme?.radius || "0.5rem" }}
                  title="Radius Visual Preview"
                />
              </div>
            </div>

            <p className="text-[11.5px] text-muted-foreground leading-relaxed">
              Applied consistently to ad overlays, product cards, call-to-action
              containers, and visual badges.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface BusinessProfileBrandingTabProps {
  data: BusinessProfileConnectorSchema;
  onSave?: (
    updatedBrand: BusinessProfileBrand,
    updatedUrl?: string,
  ) => Promise<void> | void;
}

export function BusinessProfileBrandingTab({
  data,
}: BusinessProfileBrandingTabProps) {
  const { brand, url } = data;
  const [logoError, setLogoError] = useState(false);

  // A connector can exist before its first analysis writes a brand.
  if (!brand) {
    return (
      <div className="bg-linen border border-border/80 rounded-2xl p-8 text-center space-y-2 shadow-2xs">
        <h4 className="text-sm font-bold text-foreground">
          No brand profile yet
        </h4>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Branding appears once the site has been analysed. Reconnect your
          Brand Brain to run the analysis.
        </p>
      </div>
    );
  }

  const brandInitials = getCompetitorInitials(brand.name);
  const showLogo = Boolean(brand.logoUrl && !logoError);

  const keywords = brand.keywords;
  const broadPhrases = keywords?.broadPhrases || [];
  const productOrServicePhrases = keywords?.productOrServicePhrases || [];
  const totalKeywordsCount =
    broadPhrases.length + productOrServicePhrases.length;

  return (
    <div className="space-y-3">
      {/* Brand Header Card */}
      <div className="bg-linen border border-border/80 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          {showLogo ? (
            <div className="w-11 h-11 rounded-xl border border-border/80 bg-card p-1.5 shrink-0 flex items-center justify-center shadow-2xs overflow-hidden">
              <img
                src={brand.logoUrl!}
                alt={brand.name}
                className="w-full h-full object-contain"
                onError={() => setLogoError(true)}
              />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-xl border border-border/80 bg-card font-bold text-xs sm:text-sm text-forest flex items-center justify-center shrink-0 shadow-2xs tracking-wider">
              {brandInitials}
            </div>
          )}

          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
              {brand.name || "Brand Name"}
            </h3>
            {url && (
              <span
                
                
                
                className="text-xs text-forest hover:underline inline-flex items-center gap-1 font-medium mt-0.5"
              >
                <span>{url.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Curated Overview Section */}
      <div className="bg-linen border border-border/80 rounded-2xl p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-forest" />
            <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
              Overview
            </h4>
          </div>
        </div>

        {brand.overview ? (
          <div className="prose prose-sm max-w-none text-foreground leading-relaxed pt-0.5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {brand.overview}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-xs text-muted-2 italic py-3 text-center">
            No overview snippet extracted yet.
          </div>
        )}
      </div>

      {/* Brand Search & Targeting Keywords */}
      <div className="bg-linen border border-border/80 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between pb-1.5 border-b border-border/60 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-forest" />
            <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
              Brand Search &amp; Targeting Keywords
            </h4>
          </div>
        </div>

        {totalKeywordsCount > 0 ? (
          <div className="space-y-3 pt-0.5">
            {/* Broad / Category Phrases */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-bold text-foreground uppercase tracking-tight">
                  Broad / Category Keywords
                </span>
                <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-card px-2 py-0.5 rounded-none border border-border/70 font-semibold shadow-2xs">
                  {broadPhrases.length}
                </span>
              </div>
              {broadPhrases.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {broadPhrases.map((phrase, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-medium text-foreground bg-card px-2.5 py-1 rounded-lg border border-border/80 shadow-2xs hover:border-border-strong transition-colors"
                    >
                      {phrase}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-2 italic py-0.5">
                  No broad category phrases recorded.
                </p>
              )}
            </div>

            {/* Product / Service Phrases */}
            <div className="space-y-1.5 pt-1 border-t border-border/60">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-bold text-foreground uppercase tracking-tight">
                  Product / Service Phrases
                </span>
                <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-card px-2 py-0.5 rounded-none border border-border/70 font-semibold shadow-2xs">
                  {productOrServicePhrases.length}
                </span>
              </div>
              {productOrServicePhrases.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {productOrServicePhrases.map((phrase, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-medium text-foreground bg-card px-2.5 py-1 rounded-lg border border-border/80 shadow-2xs hover:border-border-strong transition-colors"
                    >
                      {phrase}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-2 italic py-0.5">
                  No product or service phrases recorded.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-2 italic py-3 text-center">
            No brand keywords extracted yet.
          </div>
        )}
      </div>

      <BusinessProfileGuidelinesSection data={data} />
    </div>
  );
}
