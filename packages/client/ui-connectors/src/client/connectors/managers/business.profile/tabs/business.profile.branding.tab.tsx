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
  Pencil,
  Sparkles,
  X,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useModalEditActions } from "../../base.modal";
import { getCompetitorInitials } from "./business.profile.competitors.tab";
import { markdownComponents } from "../../../../markdown.components";
import type {
  BusinessProfileConnectorSchema,
  BusinessProfileBrand,
  BrandTheme,
} from "../../../../lib/business.profile";

/** Hard ceiling per keyword list, matching the business-profile skill. */
const MAX_KEYWORDS_PER_LIST = 10;

export function BusinessProfileGuidelinesSection({
  data,
}: {
  data: BusinessProfileConnectorSchema;
}) {
  const { brand } = data;
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

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
      <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-border flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-brand" />
            <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
              Color System &amp; Palette
            </h4>
          </div>
          <span className="text-[11px] text-foreground font-medium px-2 py-0.5 rounded-none bg-card border border-border">
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
                  className="flex items-center gap-2.5 p-2.5 rounded-none border border-border bg-card hover:bg-muted hover:border-input transition-all text-left group cursor-pointer relative"
                >
                  <div
                    className="w-8 h-8 rounded-none border border-border shrink-0 flex items-center justify-center transition-transform group-hover:scale-105"
                    style={{ backgroundColor: color.value }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono text-muted-foreground block leading-tight font-semibold">
                        {color.label}
                      </span>
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-success shrink-0" />
                      ) : (
                        <Copy className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
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
          <p className="text-xs text-foreground bg-card p-3 rounded-none border border-border">
            {legacyThemeString}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic py-2">
            No colors extracted.
          </p>
        )}
      </div>

      {/* Typography & Shape Specifications */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Typography */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-brand" />
              <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
                Typography
              </h4>
            </div>
          </div>

          <div className="space-y-2 pt-0.5">
            <div>
              <span className="text-[10px] uppercase font-mono text-muted-foreground block font-semibold">
                Typography Font Families
              </span>
              {Array.isArray(brand.fontNames) && brand.fontNames.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {brand.fontNames.map((fontName, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] font-medium text-foreground bg-card px-2 py-0.5 rounded-none border border-border"
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
              <div className="pt-2 border-t border-border space-y-1">
                <span className="text-[10px] uppercase font-mono text-muted-foreground block font-semibold">
                  Web Font Resources
                </span>
                <div className="space-y-1">
                  {brand.fontUrls.map((font, idx) => (
                    <a
                      key={idx}
                      href={font}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand hover:underline flex items-center gap-1 truncate font-mono bg-card px-2.5 py-1.5 rounded-none border border-border"
                    >
                      <span className="truncate">{font}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Shape & Corner Radius */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand" />
              <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
                Corner Radius &amp; Geometry
              </h4>
            </div>
          </div>

          <div className="space-y-2 pt-0.5">
            <div>
              <span className="text-[10px] uppercase font-mono text-muted-foreground block font-semibold">
                Average Surface Radius
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono font-semibold bg-card text-foreground px-2.5 py-1 rounded-none border border-border">
                  {theme?.radius || "0.75rem (Rounded)"}
                </span>
                <div
                  className="w-6 h-6 border-2 border-brand bg-brand/10"
                  style={{ borderRadius: theme?.radius || "0px" }}
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

function EditableTagList({
  title,
  count,
  tags,
  placeholder,
  onAdd,
  onRemove,
}: {
  title: string;
  count: number;
  tags: string[];
  placeholder: string;
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
}) {
  const [inputVal, setInputVal] = useState("");

  const handleAdd = () => {
    const trimmed = inputVal.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setInputVal("");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-foreground uppercase tracking-tight">
          {title}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground bg-card px-2 py-0.5 rounded-none border border-border font-semibold">
          {count}
        </span>
      </div>

      <div className="p-2.5 bg-card border border-border rounded-none space-y-2">
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-medium bg-muted border border-border text-foreground"
              >
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  title="Remove tag"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={placeholder}
            className="flex-1 bg-muted border border-border rounded-none px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-input focus:bg-card transition-all"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!inputVal.trim()}
            className="px-3 py-1.5 bg-brand hover:bg-brand-hover disabled:opacity-50 text-primary-foreground rounded-none text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
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
  onSave,
}: BusinessProfileBrandingTabProps) {
  const { brand, url } = data;
  const [logoError, setLogoError] = useState(false);
  const brandInitials = getCompetitorInitials(brand.name);
  const showLogo = Boolean(brand.logoUrl && !logoError);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState(brand.name || "");
  const [websiteUrl, setWebsiteUrl] = useState(url || "");
  const [logoUrl, setLogoUrl] = useState(brand.logoUrl || "");
  const [overview, setOverview] = useState(brand.overview || "");
  const [broadPhrases, setBroadPhrases] = useState<string[]>(
    brand.keywords?.broadPhrases || [],
  );
  const [productOrServicePhrases, setProductOrServicePhrases] = useState<
    string[]
  >(brand.keywords?.productOrServicePhrases || []);

  const themeObj: BrandTheme | null =
    typeof brand.theme === "object" && brand.theme !== null
      ? brand.theme
      : null;

  const [primaryColor, setPrimaryColor] = useState(
    themeObj?.primary || "var(--brand)",
  );
  const [primaryAccentColor, setPrimaryAccentColor] = useState(
    themeObj?.primaryAccent || "var(--brand-accent)",
  );
  const [secondaryColor, setSecondaryColor] = useState(
    themeObj?.secondary || "var(--brand-hover)",
  );
  const [backgroundColor, setBackgroundColor] = useState(
    themeObj?.background || "var(--card)",
  );
  const [foregroundColor, setForegroundColor] = useState(
    themeObj?.foreground || "var(--foreground)",
  );
  const [radius, setRadius] = useState(themeObj?.radius || "0.75rem");
  const [fontNames, setFontNames] = useState<string[]>(brand.fontNames || []);

  const startEditing = () => {
    setName(brand.name || "");
    setWebsiteUrl(url || "");
    setLogoUrl(brand.logoUrl || "");
    setOverview(brand.overview || "");
    setBroadPhrases(brand.keywords?.broadPhrases || []);
    setProductOrServicePhrases(brand.keywords?.productOrServicePhrases || []);
    setPrimaryColor(themeObj?.primary || "var(--brand)");
    setPrimaryAccentColor(themeObj?.primaryAccent || "var(--brand-accent)");
    setSecondaryColor(themeObj?.secondary || "var(--brand-hover)");
    setBackgroundColor(themeObj?.background || "var(--card)");
    setForegroundColor(themeObj?.foreground || "var(--foreground)");
    setRadius(themeObj?.radius || "0.75rem");
    setFontNames(brand.fontNames || []);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setName(brand.name || "");
    setWebsiteUrl(url || "");
    setLogoUrl(brand.logoUrl || "");
    setOverview(brand.overview || "");
    setBroadPhrases(brand.keywords?.broadPhrases || []);
    setProductOrServicePhrases(brand.keywords?.productOrServicePhrases || []);
    setPrimaryColor(themeObj?.primary || "var(--brand)");
    setPrimaryAccentColor(themeObj?.primaryAccent || "var(--brand-accent)");
    setSecondaryColor(themeObj?.secondary || "var(--brand-hover)");
    setBackgroundColor(themeObj?.background || "var(--card)");
    setForegroundColor(themeObj?.foreground || "var(--foreground)");
    setRadius(themeObj?.radius || "0.75rem");
    setFontNames(brand.fontNames || []);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Brand name is required");
      return;
    }

    setIsSaving(true);
    try {
      const updatedBrand: BusinessProfileBrand = {
        ...brand,
        name: name.trim(),
        overview: overview.trim(),
        logoUrl: logoUrl.trim() || null,
        fontNames: fontNames.filter((f) => f.trim().length > 0),
        keywords: {
          broadPhrases: broadPhrases
            .filter((p) => p.trim().length > 0)
            .slice(0, MAX_KEYWORDS_PER_LIST),
          productOrServicePhrases: productOrServicePhrases
            .filter((p) => p.trim().length > 0)
            .slice(0, MAX_KEYWORDS_PER_LIST),
        },
        theme: {
          ...(typeof brand.theme === "object" ? brand.theme : {}),
          primary: primaryColor,
          primaryAccent: primaryAccentColor,
          secondary: secondaryColor,
          background: backgroundColor,
          foreground: foregroundColor,
          radius: radius,
        },
      };

      await onSave?.(updatedBrand, websiteUrl.trim() || undefined);
      toast.success("Branding updated successfully");
      setIsEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save branding";
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

  const keywords = brand.keywords;
  const viewBroadPhrases = keywords?.broadPhrases || [];
  const viewProductOrServicePhrases = keywords?.productOrServicePhrases || [];
  const totalKeywordsCount =
    viewBroadPhrases.length + viewProductOrServicePhrases.length;

  if (!isEditing) {
    return (
      <div className="space-y-3">
        {/* Top Header with Edit Button */}
        <div className="flex items-center justify-between pb-0.5">
          <span className="text-xs font-semibold text-foreground">
            Brand Identity &amp; Design System
          </span>
          <button
            type="button"
            onClick={startEditing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors cursor-pointer"
          >
            <Pencil className="w-3 h-3 text-muted-foreground" />
            <span>Edit Branding</span>
          </button>
        </div>

        {/* Brand Header Card */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {showLogo ? (
              <div className="w-11 h-11 rounded-none border border-border bg-card p-1.5 shrink-0 flex items-center justify-center overflow-hidden">
                <img
                  src={brand.logoUrl!}
                  alt={brand.name}
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-none border border-border bg-card font-bold text-xs sm:text-sm text-brand flex items-center justify-center shrink-0 tracking-wider">
                {brandInitials}
              </div>
            )}

            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                {brand.name || "Brand Name"}
              </h3>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand hover:underline inline-flex items-center gap-1 font-medium mt-0.5"
                >
                  <span>{url.replace(/^https?:\/\//, "")}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Curated Overview Section */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand" />
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
            <div className="text-xs text-muted-foreground italic py-3 text-center">
              No overview snippet extracted yet.
            </div>
          )}
        </div>

        {/* Search Keywords and Phrases */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-border flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand" />
              <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
                Search Keywords and Phrases
              </h4>
            </div>
          </div>

          {totalKeywordsCount > 0 ? (
            <div className="space-y-3 pt-0.5">
              {/* Broad / Category Phrases */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-foreground uppercase tracking-tight">
                    Broad / Category Keywords
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground bg-card px-2 py-0.5 rounded-none border border-border font-semibold">
                    {viewBroadPhrases.length}
                  </span>
                </div>
                {viewBroadPhrases.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {viewBroadPhrases.map((phrase, idx) => (
                      <span
                        key={idx}
                        className="text-xs font-medium text-foreground bg-card px-2.5 py-1 rounded-none border border-border hover:border-input transition-colors"
                      >
                        {phrase}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic py-0.5">
                    No broad category phrases recorded.
                  </p>
                )}
              </div>

              {/* Product / Service Phrases */}
              <div className="space-y-1.5 pt-1 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-foreground uppercase tracking-tight">
                    Product / Service Phrases
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground bg-card px-2 py-0.5 rounded-none border border-border font-semibold">
                    {viewProductOrServicePhrases.length}
                  </span>
                </div>
                {viewProductOrServicePhrases.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {viewProductOrServicePhrases.map((phrase, idx) => (
                      <span
                        key={idx}
                        className="text-xs font-medium text-foreground bg-card px-2.5 py-1 rounded-none border border-border hover:border-input transition-colors"
                      >
                        {phrase}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic py-0.5">
                    No product or service phrases recorded.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic py-3 text-center">
              No brand keywords extracted yet.
            </div>
          )}
        </div>

        <BusinessProfileGuidelinesSection data={data} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-0.5">
        <span className="text-xs font-semibold text-foreground">
          Edit Brand Identity &amp; Guidelines
        </span>
      </div>

      {/* 1. Brand Identity Card */}
      <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between pb-1.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand" />
            <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
              Brand Identity
            </h4>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground">
              Brand Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GrowEasy"
              className="w-full bg-card border border-border rounded-none px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-ring/10 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground">
              Website URL
            </label>
            <input
              type="text"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-card border border-border rounded-none px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-ring/10 transition-all"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-[11px] font-semibold text-foreground">
              Logo Image URL
            </label>
            <div className="flex items-center gap-2.5">
              {logoUrl.trim() ? (
                <div className="w-9 h-9 rounded-none border border-border bg-card p-1 shrink-0 flex items-center justify-center overflow-hidden">
                  <img
                    src={logoUrl}
                    alt="Preview"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              ) : null}
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="flex-1 bg-card border border-border rounded-none px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-ring/10 transition-all font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Overview Narrative Card */}
      <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand" />
            <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
              Brand Overview &amp; Narrative
            </h4>
          </div>
        </div>

        <div className="space-y-1">
          <textarea
            rows={5}
            value={overview}
            onChange={(e) => setOverview(e.target.value)}
            placeholder="Write a clear, structured overview of your brand value proposition, core market, and audience..."
            className="w-full bg-card border border-border rounded-none p-3 text-xs leading-relaxed text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-ring/10 transition-all"
          />
          <p className="text-[10.5px] text-muted-foreground">
            Supports Markdown formatting. Concisely describe what your brand offers, target market, and primary solutions.
          </p>
        </div>
      </div>

      {/* 3. Search Keywords and Phrases Card */}
      <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-3.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-brand" />
            <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
              Search Keywords and Phrases
            </h4>
          </div>
        </div>

        <EditableTagList
          title="Broad / Category Keywords"
          count={broadPhrases.length}
          tags={broadPhrases}
          placeholder="Type category keyword and press Enter..."
          onAdd={(tag) => {
            if (broadPhrases.length >= MAX_KEYWORDS_PER_LIST) {
              toast.info(`Maximum ${MAX_KEYWORDS_PER_LIST} broad keywords`);
              return;
            }
            if (!broadPhrases.includes(tag)) {
              setBroadPhrases([...broadPhrases, tag]);
            }
          }}
          onRemove={(idx) => {
            setBroadPhrases(broadPhrases.filter((_, i) => i !== idx));
          }}
        />

        <div className="pt-2 border-t border-border">
          <EditableTagList
            title="Product / Service Phrases"
            count={productOrServicePhrases.length}
            tags={productOrServicePhrases}
            placeholder="Type product/service phrase and press Enter..."
            onAdd={(tag) => {
              if (productOrServicePhrases.length >= MAX_KEYWORDS_PER_LIST) {
                toast.info(
                  `Maximum ${MAX_KEYWORDS_PER_LIST} product/service phrases`,
                );
                return;
              }
              if (!productOrServicePhrases.includes(tag)) {
                setProductOrServicePhrases([...productOrServicePhrases, tag]);
              }
            }}
            onRemove={(idx) => {
              setProductOrServicePhrases(
                productOrServicePhrases.filter((_, i) => i !== idx),
              );
            }}
          />
        </div>
      </div>

      {/* 4. Color System & Palette Card */}
      <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between pb-1.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-brand" />
            <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
              Color System &amp; Palette
            </h4>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Primary */}
          <div className="space-y-1.5 p-2.5 bg-card border border-border rounded-none">
            <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold block">
              Primary Brand Tone
            </span>
            <div className="flex items-center gap-2">
              <label
                className="w-8 h-8 rounded-none border border-border shrink-0 cursor-pointer relative overflow-hidden"
                style={{ backgroundColor: primaryColor }}
                title="Pick color"
              >
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
              </label>
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 text-xs font-mono font-bold text-foreground border border-border rounded-none px-2 py-1.5 focus:outline-none focus:border-foreground"
              />
            </div>
          </div>

          {/* Accent */}
          <div className="space-y-1.5 p-2.5 bg-card border border-border rounded-none">
            <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold block">
              Primary Accent (CTA)
            </span>
            <div className="flex items-center gap-2">
              <label
                className="w-8 h-8 rounded-none border border-border shrink-0 cursor-pointer relative overflow-hidden"
                style={{ backgroundColor: primaryAccentColor }}
                title="Pick color"
              >
                <input
                  type="color"
                  value={primaryAccentColor}
                  onChange={(e) => setPrimaryAccentColor(e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
              </label>
              <input
                type="text"
                value={primaryAccentColor}
                onChange={(e) => setPrimaryAccentColor(e.target.value)}
                className="flex-1 text-xs font-mono font-bold text-foreground border border-border rounded-none px-2 py-1.5 focus:outline-none focus:border-foreground"
              />
            </div>
          </div>

          {/* Secondary */}
          <div className="space-y-1.5 p-2.5 bg-card border border-border rounded-none">
            <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold block">
              Secondary Element
            </span>
            <div className="flex items-center gap-2">
              <label
                className="w-8 h-8 rounded-none border border-border shrink-0 cursor-pointer relative overflow-hidden"
                style={{ backgroundColor: secondaryColor }}
                title="Pick color"
              >
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
              </label>
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="flex-1 text-xs font-mono font-bold text-foreground border border-border rounded-none px-2 py-1.5 focus:outline-none focus:border-foreground"
              />
            </div>
          </div>

          {/* Background */}
          <div className="space-y-1.5 p-2.5 bg-card border border-border rounded-none">
            <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold block">
              Canvas Background
            </span>
            <div className="flex items-center gap-2">
              <label
                className="w-8 h-8 rounded-none border border-border shrink-0 cursor-pointer relative overflow-hidden"
                style={{ backgroundColor: backgroundColor }}
                title="Pick color"
              >
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
              </label>
              <input
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="flex-1 text-xs font-mono font-bold text-foreground border border-border rounded-none px-2 py-1.5 focus:outline-none focus:border-foreground"
              />
            </div>
          </div>

          {/* Foreground */}
          <div className="space-y-1.5 p-2.5 bg-card border border-border rounded-none">
            <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold block">
              Typography Foreground
            </span>
            <div className="flex items-center gap-2">
              <label
                className="w-8 h-8 rounded-none border border-border shrink-0 cursor-pointer relative overflow-hidden"
                style={{ backgroundColor: foregroundColor }}
                title="Pick color"
              >
                <input
                  type="color"
                  value={foregroundColor}
                  onChange={(e) => setForegroundColor(e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
              </label>
              <input
                type="text"
                value={foregroundColor}
                onChange={(e) => setForegroundColor(e.target.value)}
                className="flex-1 text-xs font-mono font-bold text-foreground border border-border rounded-none px-2 py-1.5 focus:outline-none focus:border-foreground"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 5. Typography & Geometry Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Typography */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-brand" />
              <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
                Typography Font Families
              </h4>
            </div>
          </div>

          <EditableTagList
            title="Font Families"
            count={fontNames.length}
            tags={fontNames}
            placeholder="e.g. Inter, Plus Jakarta Sans..."
            onAdd={(font) => {
              if (!fontNames.includes(font)) {
                setFontNames([...fontNames, font]);
              }
            }}
            onRemove={(idx) => {
              setFontNames(fontNames.filter((_, i) => i !== idx));
            }}
          />
        </div>

        {/* Shape & Corner Radius */}
        <div className="bg-muted border border-border rounded-none p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand" />
              <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
                Corner Radius &amp; Geometry
              </h4>
            </div>
          </div>

          <div className="space-y-2 pt-0.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                placeholder="e.g. 0.75rem or 12px"
                className="flex-1 bg-card border border-border rounded-none px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-foreground"
              />
              <div
                className="w-9 h-9 border-2 border-brand bg-brand/10 shrink-0 transition-all"
                style={{ borderRadius: radius || "0px" }}
                title="Preview"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {["0.25rem", "0px", "0.75rem", "1rem", "9999px"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRadius(preset)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded-none border transition-all cursor-pointer ${
                    radius === preset
                      ? "bg-brand text-primary-foreground border-brand"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
