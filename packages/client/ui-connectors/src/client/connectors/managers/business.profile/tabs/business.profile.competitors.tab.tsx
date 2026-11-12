"use client";

import React, { useState } from "react";
import {
  Users,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  Globe,
  FileText,
  Film,
} from "lucide-react";
import { toast } from "sonner";
import { useModalEditActions } from "../../base.modal";
import type {
  BusinessProfileConnectorSchema,
  BusinessProfileCompetitors,
  CompetitorAd,
  CompetitorProfileItem,
} from "../../../../lib/business.profile";

interface BusinessProfileCompetitorsTabProps {
  data: BusinessProfileConnectorSchema;
  onSave?: (competitors: BusinessProfileCompetitors) => Promise<void>;
}

export function getCompetitorInitials(name?: string): string {
  if (!name || typeof name !== "string") return "CO";
  const trimmed = name.trim();
  if (!trimmed) return "CO";

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function getValidCompetitorLogo(logo?: string): string | undefined {
  if (!logo || typeof logo !== "string") return undefined;
  const trimmed = logo.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  const isWhiteSvg =
    lower.includes("-white.svg") ||
    lower.includes("logo-white.svg") ||
    lower.includes("-white.");
  if (isWhiteSvg) return undefined;
  return trimmed;
}

/**
 * One ad's creative inside the fixed-size card.
 *
 * The creative is `object-contain`, never cropped: a 9:16 video fits by height
 * and gives up width, a 1:1 image fills the square exactly, a 16:9 creative
 * fits by width and leaves top/bottom breathing room. Letterboxing sits on a
 * neutral surface so the card keeps one uniform size for every source ratio.
 * The player chrome is the browser's own, not the chat attachment viewer,
 * whose layout is built for full-width transcript media.
 */
function AdCreative({ ad }: { ad: CompetitorAd }) {
  const url = (ad.mediaUrls || [])[0];
  if (!url) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
        <Film className="w-5 h-5 opacity-50" />
        <span className="text-[10px] font-mono uppercase tracking-tight">
          {ad.format === "video" ? "Video ad" : "Static ad"}
        </span>
      </div>
    );
  }

  if (ad.format === "video") {
    return (
      <video
        src={url}
        className="absolute inset-0 h-full w-full object-contain"
        controls
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <img
      src={url}
      alt={ad.label || "Competitor ad"}
      loading="lazy"
      className="absolute inset-0 h-full w-full object-contain"
    />
  );
}

/**
 * A competitor's recent ads as a horizontal snap carousel of equal cards.
 *
 * Each ad is one square card; the row scrolls sideways with scroll-snap so the
 * cards sit edge to edge and every source aspect ratio reads whole inside its
 * own card.
 */
function CompetitorAdsCarousel({ ads }: { ads: CompetitorAd[] }) {
  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ads.map((ad, idx) => (
        <div
          key={`${ad.adUrl}-${idx}`}
          className="w-44 shrink-0 snap-start border border-border bg-card"
        >
          <div className="relative aspect-square overflow-hidden bg-muted">
            <AdCreative ad={ad} />

            <span className="absolute left-1.5 top-1.5 border border-white/20 bg-black/60 px-1.5 py-0.5 text-[9.5px] font-mono font-semibold uppercase tracking-tight text-white">
              {ad.format === "video" ? "Video" : "Static"}
            </span>

            <a
              href={ad.adUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute right-1.5 top-1.5 border border-white/20 bg-black/60 p-1 text-white transition-colors hover:text-brand"
              title="Open ad"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {ad.label && (
            <p className="px-2 py-1.5 text-[11px] leading-snug text-foreground line-clamp-2">
              {ad.label}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

interface CompetitorCardProps {
  competitor: CompetitorProfileItem;
  index: number;
  isEditing: boolean;
  onUpdate: (patch: Partial<CompetitorProfileItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function CompetitorCard({
  competitor,
  index,
  isEditing,
  onUpdate,
  onRemove,
  canRemove,
}: CompetitorCardProps) {
  const [imgError, setImgError] = useState(false);
  const [prevLogo, setPrevLogo] = useState(competitor.logo);

  if (competitor.logo !== prevLogo) {
    setPrevLogo(competitor.logo);
    setImgError(false);
  }

  const validLogo = getValidCompetitorLogo(competitor.logo);
  const showImage = Boolean(validLogo && !imgError);
  const initials = getCompetitorInitials(competitor.name);
  const ads = competitor.ads || [];

  return (
    <div className="bg-muted border border-border rounded-none p-4 sm:p-5 space-y-3.5 hover:border-input transition-all">
      {/* 1. Header Row: Logo, Name, Website Link, and Delete action (when editing) */}
      {!isEditing ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {showImage ? (
              <div className="w-10 h-10 rounded-none border border-border bg-card p-1.5 shrink-0 flex items-center justify-center overflow-hidden">
                <img
                  src={validLogo}
                  alt={competitor.name}
                  className="w-full h-full object-contain"
                  onError={() => setImgError(true)}
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-none border border-border bg-card font-bold text-xs text-brand flex items-center justify-center shrink-0 tracking-wider">
                {initials}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                  {competitor.name}
                </h3>
              </div>
              {competitor.website && (
                <a
                  href={
                    competitor.website.startsWith("http")
                      ? competitor.website
                      : `https://${competitor.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand hover:underline inline-flex items-center gap-1 font-medium mt-0.5 truncate max-w-full"
                >
                  <Globe className="w-3 h-3 shrink-0 opacity-60" />
                  <span className="truncate">
                    {competitor.website.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Edit Mode: Competitor Details */
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-foreground uppercase tracking-tight">
              Competitor #{index + 1}
            </span>
            {canRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="text-xs text-destructive hover:text-destructive font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="text-[10.5px] uppercase font-mono font-semibold text-muted-foreground block mb-1">
                Name *
              </label>
              <input
                type="text"
                value={competitor.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="Competitor name"
                className="w-full text-xs px-3 py-2 bg-card border border-border rounded-none focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            <div>
              <label className="text-[10.5px] uppercase font-mono font-semibold text-muted-foreground block mb-1">
                Website URL
              </label>
              <input
                type="url"
                value={competitor.website || ""}
                onChange={(e) => onUpdate({ website: e.target.value })}
                placeholder="https://competitor.com"
                className="w-full text-xs px-3 py-2 bg-card border border-border rounded-none focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            <div>
              <label className="text-[10.5px] uppercase font-mono font-semibold text-muted-foreground block mb-1">
                Logo URL
              </label>
              <input
                type="url"
                value={competitor.logo || ""}
                onChange={(e) => onUpdate({ logo: e.target.value })}
                placeholder="https://competitor.com/logo.png"
                className="w-full text-xs px-3 py-2 bg-card border border-border rounded-none focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>
        </div>
      )}

      {/* Divider between header and overview */}
      <div className="border-t border-border" />

      {/* 2. Overview Section: Simple "Overview" title and 3-4 line paragraph without outer box */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-brand" />
          <span className="text-[11px] font-bold text-foreground uppercase tracking-tight">
            Overview
          </span>
        </div>

        {!isEditing ? (
          competitor.overview ? (
            <p className="text-xs sm:text-sm text-foreground leading-relaxed">
              {competitor.overview}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No overview summary provided for this competitor yet.
            </p>
          )
        ) : (
          <textarea
            rows={3}
            value={competitor.overview || ""}
            onChange={(e) => onUpdate({ overview: e.target.value })}
            placeholder="Enter 3-4 lines summary of what this competitor does, offerings, and market positioning..."
            className="w-full text-xs px-3 py-2 bg-card border border-border rounded-none focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand leading-relaxed"
          />
        )}
      </div>

      {/* 3. Divider between overview and recent ads */}
      <div className="border-t border-border" />

      {/* 4. Recent ads: collector URLs rendered as-is with the shared media blocks */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-brand" />
            <span className="text-[11px] font-bold text-foreground uppercase tracking-tight">
              Recent Ads
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground bg-card px-2 py-0.5 rounded-none border border-border font-semibold">
            {ads.length}
          </span>
        </div>

        {ads.length > 0 ? (
          <CompetitorAdsCarousel ads={ads} />
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No recent ads collected for this competitor.
          </p>
        )}
      </div>
    </div>
  );
}

export function BusinessProfileCompetitorsTab({
  data,
  onSave,
}: BusinessProfileCompetitorsTabProps) {
  const initialList = data.competitors?.competitors || [];
  const [competitors, setCompetitors] =
    useState<CompetitorProfileItem[]>(initialList);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleCancel = () => {
    setCompetitors(data.competitors?.competitors || []);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (competitors.length === 0) {
      toast.error("Please add at least one competitor");
      return;
    }

    const hasEmptyName = competitors.some((c) => !c.name || !c.name.trim());
    if (hasEmptyName) {
      toast.error("All competitors must have a name");
      return;
    }

    setIsSaving(true);
    try {
      const cleaned: CompetitorProfileItem[] = competitors.map((c) => ({
        name: c.name.trim(),
        website: c.website?.trim() || undefined,
        logo: c.logo?.trim() || undefined,
        overview: c.overview?.trim() || undefined,
        ads: (c.ads || [])
          .filter((ad) => ad.adUrl?.trim())
          .map((ad) => ({
            format: ad.format === "video" ? "video" : "static",
            adUrl: ad.adUrl.trim(),
            ...((ad.mediaUrls || []).filter((m) => m.trim()).length > 0
              ? {
                  mediaUrls: (ad.mediaUrls || [])
                    .map((m) => m.trim())
                    .filter(Boolean),
                }
              : {}),
            ...(ad.label?.trim() ? { label: ad.label.trim() } : {}),
          })),
      }));

      await onSave?.({
        competitors: cleaned,
      });
      toast.success("Competitors updated successfully");
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

  const updateCompetitor = (
    index: number,
    patch: Partial<CompetitorProfileItem>,
  ) => {
    setCompetitors((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const removeCompetitor = (index: number) => {
    if (competitors.length <= 1) {
      toast.error("At least one competitor must remain");
      return;
    }
    setCompetitors((prev) => prev.filter((_, i) => i !== index));
  };

  const addCompetitor = () => {
    const newComp: CompetitorProfileItem = {
      name: `Competitor ${competitors.length + 1}`,
      website: "",
      logo: "",
      overview: "",
      ads: [],
    };
    setCompetitors((prev) => [...prev, newComp]);
  };

  return (
    <div className="space-y-3">
      {/* Top Bar: Section Title (Left) + Total Count & Edit Actions (Right). NO upper layer tags. */}
      <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Users className="w-3.5 h-3.5 text-brand" />
          <span>Competitors</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Total Competitors Count directly on the right */}
          <span className="text-[11px] text-foreground font-semibold px-2.5 py-1 rounded-none bg-muted border border-border font-mono">
            {competitors.length === 1
              ? "1 Competitor"
              : `${competitors.length} Competitors`}
          </span>

          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors cursor-pointer"
            >
              <Pencil className="w-3 h-3 text-muted-foreground" />
              <span>Edit Competitors</span>
            </button>
          )}
        </div>
      </div>

      {/* Infinite Scroll List: All competitors from database rendered directly in continuous scroll */}
      {competitors.length > 0 ? (
        <div className="space-y-3">
          {competitors.map((comp, idx) => (
            <CompetitorCard
              key={`${comp.name}-${idx}`}
              competitor={comp}
              index={idx}
              isEditing={isEditing}
              onUpdate={(patch) => updateCompetitor(idx, patch)}
              onRemove={() => removeCompetitor(idx)}
              canRemove={competitors.length > 1}
            />
          ))}

          {isEditing && (
            <button
              type="button"
              onClick={addCompetitor}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-none border-2 border-dashed border-border hover:border-brand text-xs font-semibold text-muted-foreground hover:text-brand bg-muted hover:bg-brand/5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Another Competitor</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-muted border border-border rounded-none p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-none bg-card border border-border flex items-center justify-center mx-auto text-brand">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              No Competitors Recorded
            </h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
              No competitors have been added or discovered for this brand yet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              addCompetitor();
              setIsEditing(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground bg-brand hover:bg-brand-hover rounded-none transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add First Competitor</span>
          </button>
        </div>
      )}
    </div>
  );
}
