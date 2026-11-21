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
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  isCompetitorAdMedia,
  type BusinessProfileConnectorSchema,
  type BusinessProfileCompetitors,
  type CompetitorAd,
  type CompetitorProfileItem,
} from "@/lib/connectors/business.profile";

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
 * One ad's creative inside a fixed-size card.
 *
 * `object-contain` so a 9:16 video, 1:1 image, or 16:9 creative all read whole
 * inside the same square instead of being cropped.
 */
function AdCreative({ ad }: { ad: CompetitorAd }) {
  const first = ad.media?.[0];
  if (!first) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
        <Film className="w-5 h-5 opacity-50" />
        <span className="text-[10px] font-mono uppercase tracking-tight">
          No media
        </span>
      </div>
    );
  }

  if (first.kind === "video") {
    return (
      <video
        src={first.url}
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
      src={first.url}
      alt="Competitor ad"
      loading="lazy"
      className="absolute inset-0 h-full w-full object-contain"
    />
  );
}

/** A competitor's recent ads as a horizontal, snap-scrolling row of cards. */
function CompetitorAdsCarousel({ ads }: { ads: CompetitorAd[] }) {
  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ads.map((ad, idx) => {
        const first = ad.media?.[0];
        return (
          <div
            key={`${ad.id}-${idx}`}
            className="w-44 shrink-0 snap-start overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs"
          >
            <div className="relative aspect-square overflow-hidden bg-linen">
              <AdCreative ad={ad} />

              <span className="absolute left-1.5 top-1.5 rounded-sm border border-white/20 bg-black/60 px-1.5 py-0.5 text-[9.5px] font-mono font-semibold uppercase tracking-tight text-white">
                {first?.kind === "video" ? "Video" : "Static"}
              </span>

              {ad.media.length > 1 && (
                <span className="absolute bottom-1.5 left-1.5 rounded-sm border border-white/20 bg-black/60 px-1.5 py-0.5 text-[9.5px] font-mono font-semibold text-white">
                  +{ad.media.length - 1}
                </span>
              )}

              <a
                href={`https://www.facebook.com/ads/library/?id=${ad.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute right-1.5 top-1.5 rounded-sm border border-white/20 bg-black/60 p-1 text-white transition-colors hover:text-forest"
                title="Open ad"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <p className="px-2 py-1.5 text-[10px] font-mono text-muted-foreground truncate">
              ID {ad.id}
            </p>
          </div>
        );
      })}
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
  const ads = competitor.ads ?? [];

  return (
    <div className="bg-linen border border-border/80 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs hover:border-border-strong transition-all">
      {/* 1. Header Row: Logo, Name, Website Link, and Delete action (when editing) */}
      {!isEditing ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {showImage ? (
              <div className="w-10 h-10 rounded-xl border border-border/80 bg-card p-1.5 shrink-0 flex items-center justify-center shadow-2xs overflow-hidden">
                <img
                  src={validLogo}
                  alt={competitor.name}
                  className="w-full h-full object-contain"
                  onError={() => setImgError(true)}
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl border border-border/80 bg-card font-bold text-xs text-forest flex items-center justify-center shrink-0 shadow-2xs tracking-wider">
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
                <span className="text-xs text-forest hover:underline inline-flex items-center gap-1 font-medium mt-0.5 truncate max-w-full">
                  <Globe className="w-3 h-3 shrink-0 opacity-60" />
                  <span className="truncate">
                    {competitor.website.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Edit Mode: Competitor Details */
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="min-w-0 truncate text-xs font-bold text-foreground uppercase tracking-tight">
              Competitor #{index + 1}
            </span>
            {canRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="shrink-0 text-xs text-destructive-strong hover:text-destructive font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="min-w-0">
              <label className="text-[10.5px] uppercase font-mono font-semibold text-muted-foreground block mb-1">
                Name *
              </label>
              <input
                type="text"
                value={competitor.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="Competitor name"
                className="w-full text-xs px-3 py-2 bg-card border border-border rounded-lg focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              />
            </div>

            <div className="min-w-0">
              <label className="text-[10.5px] uppercase font-mono font-semibold text-muted-foreground block mb-1">
                Website URL
              </label>
              <input
                type="url"
                value={competitor.website || ""}
                onChange={(e) => onUpdate({ website: e.target.value })}
                placeholder="https://competitor.com"
                className="w-full text-xs px-3 py-2 bg-card border border-border rounded-lg focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              />
            </div>

            <div className="min-w-0">
              <label className="text-[10.5px] uppercase font-mono font-semibold text-muted-foreground block mb-1">
                Logo URL
              </label>
              <input
                type="url"
                value={competitor.logo || ""}
                onChange={(e) => onUpdate({ logo: e.target.value })}
                placeholder="https://competitor.com/logo.png"
                className="w-full text-xs px-3 py-2 bg-card border border-border rounded-lg focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest"
              />
            </div>
          </div>
        </div>
      )}

      {/* Divider between header and overview */}
      <div className="border-t border-border/60" />

      {/* 2. Overview Section: Simple "Overview" title and 3-4 line paragraph without outer box */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-forest" />
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
            <p className="text-xs text-muted-2 italic">
              No overview summary provided for this competitor yet.
            </p>
          )
        ) : (
          <textarea
            rows={3}
            value={competitor.overview || ""}
            onChange={(e) => onUpdate({ overview: e.target.value })}
            placeholder="Enter 3-4 lines summary of what this competitor does, offerings, and market positioning..."
            className="w-full text-xs px-3 py-2 bg-card border border-border rounded-lg focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest leading-relaxed"
          />
        )}
      </div>

      {/* 3. Divider between overview and recent ads */}
      <div className="border-t border-border/60" />

      {/* 4. Recent ads: collector URLs rendered as their live creative */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-forest" />
            <span className="text-[11px] font-bold text-foreground uppercase tracking-tight">
              Recent Ads
            </span>
          </div>
          <span className="text-[10px] font-mono font-semibold text-muted-foreground bg-linen border border-border/80 px-2 py-0.5">
            {ads.length}
          </span>
        </div>

        {ads.length > 0 ? (
          <CompetitorAdsCarousel ads={ads} />
        ) : (
          <p className="text-xs text-muted-2 italic">
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
  const [competitors, setCompetitors] = useState<CompetitorProfileItem[]>(
    data.competitors?.competitors || [],
  );
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
      const materialized: CompetitorProfileItem[] = competitors.map((c) => ({
        name: c.name.trim(),
        website: c.website?.trim() || undefined,
        logo: c.logo?.trim() || undefined,
        overview: c.overview?.trim() || undefined,
        ads: (c.ads || [])
          .filter((ad) => ad.id?.trim())
          .map((ad) => ({
            id: ad.id.trim(),
            media: (ad.media || [])
              .filter(isCompetitorAdMedia)
              .map((m) => ({ kind: m.kind, url: m.url.trim() })),
          })),
      }));

      await onSave?.({
        competitors: materialized,
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
          <Users className="w-3.5 h-3.5 text-forest" />
          <span>Competitors</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Total Competitors Count directly on the right */}
          <span className="text-[11px] text-foreground font-semibold px-2.5 py-1 rounded-none bg-linen border border-border/80 shadow-2xs font-mono">
            {competitors.length === 1
              ? "1 Competitor"
              : `${competitors.length} Competitors`}
          </span>

          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-linen border border-border rounded-lg transition-colors cursor-pointer shadow-2xs"
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
            <>
              <button
                type="button"
                onClick={addCompetitor}
                className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-dashed border-border hover:border-forest text-xs font-semibold text-muted-foreground hover:text-forest bg-linen hover:bg-forest/5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Another Competitor</span>
              </button>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="px-3.5 py-1.5 text-xs font-semibold text-foreground bg-card hover:bg-linen border border-border rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground bg-forest hover:bg-forest-strong rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="bg-linen border border-border/80 rounded-2xl p-8 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-card border border-border/80 flex items-center justify-center mx-auto text-forest shadow-2xs">
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
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground bg-forest hover:bg-forest-strong rounded-lg transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add First Competitor</span>
          </button>
        </div>
      )}
    </div>
  );
}
