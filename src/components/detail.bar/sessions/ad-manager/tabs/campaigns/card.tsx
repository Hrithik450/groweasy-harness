"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Loader2,
  Maximize2,
  Pause,
  Play,
  X,
} from "lucide-react";
import { useModalStore } from "@/store/modal.store";
import { formatCompact, formatRoas } from "@/lib/utils/metrics.format";
import { UserVideoViewer } from "@/components/video/user.video.viewer";
import type {
  BarCard,
  CampaignAd,
  CampaignAdAction,
  AdCategory,
  ActionStatus,
} from "@/lib/detail.bar/types";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-brand hover:bg-brand-hover text-primary-foreground rounded-lg text-[11.5px] font-semibold cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-card hover:bg-muted text-foreground border border-border hover:border-border-strong rounded-lg text-[11.5px] font-medium cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

/** The ad's category as a corner tag, coloured like the alert severities. */
const CATEGORY_TAG: Record<AdCategory, { label: string; className: string }> = {
  winner: {
    label: "Winner",
    className: "bg-success-tint text-brand border border-success-border",
  },
  scaler: {
    label: "Scaler",
    className: "bg-brand text-primary-foreground border border-brand-border/30",
  },
  fading: {
    label: "Fading",
    className: "bg-warning-tint text-warning border border-warning-border",
  },
  loser: {
    label: "Loser",
    className:
      "bg-destructive-tint text-destructive border border-destructive-border",
  },
  potential: {
    label: "Potential",
    className: "bg-warning-tint text-warning border border-warning-border",
  },
  untested: {
    label: "Untested",
    className: "bg-secondary text-foreground border border-border",
  },
};

/**
 * Extended video: the shared player, portalled to the body.
 *
 * The detail bar slides with a transform, which would otherwise make a fixed
 * overlay position against the panel instead of the viewport.
 */
function AdVideoExtension({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-3xl"
      >
        <div className="flex items-center justify-end pb-2">
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="p-1.5 bg-card/90 hover:bg-card text-foreground rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <UserVideoViewer src={src} title={title} className="w-full" />
      </div>
    </div>,
    document.body,
  );
}

/** The ad's creative in miniature: play in place, extend for the full asset. */
function AdMedia({ ad }: { ad: CampaignAd }) {
  const { openLightbox } = useModalStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [extended, setExtended] = useState(false);
  const isVideo = ad.format === "video";
  const tileClass =
    "relative w-14 h-14 shrink-0 overflow-hidden flex items-center justify-center rounded-none bg-muted text-foreground text-[9.5px] font-bold font-mono uppercase tracking-tight border border-border-subtle";

  if (!ad.mediaUrl) {
    return <span className={tileClass}>{isVideo ? "VID" : "IMG"}</span>;
  }

  if (isVideo) {
    const togglePlay = () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
        void video
          .play()
          .then(() => setPlaying(true))
          .catch(() => setPlaying(false));
        return;
      }
      video.pause();
      setPlaying(false);
    };

    return (
      <div className={tileClass}>
        <video
          ref={videoRef}
          src={ad.mediaUrl}
          muted
          loop
          playsInline
          preload="metadata"
          onEnded={() => setPlaying(false)}
          className="absolute inset-0 w-full h-full object-contain"
        />

        <button
          type="button"
          onClick={togglePlay}
          title={playing ? "Pause" : "Play"}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/15 text-white transition-colors cursor-pointer"
        >
          {playing ? (
            <Pause className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Play className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setExtended(true)}
          title="Expand creative"
          className="absolute bottom-0.5 right-0.5 p-0.5 bg-black/60 hover:bg-black/85 text-white rounded transition-colors cursor-pointer"
        >
          <Maximize2 className="w-2.5 h-2.5" aria-hidden="true" />
        </button>

        {extended && (
          <AdVideoExtension
            src={ad.mediaUrl}
            title={ad.name}
            onClose={() => setExtended(false)}
          />
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        openLightbox([{ src: ad.mediaUrl as string, alt: ad.name }])
      }
      title="Open ad creative"
      className={`${tileClass} cursor-zoom-in`}
    >
      <img
        src={ad.mediaUrl}
        alt={ad.name}
        className="absolute inset-0 w-full h-full object-contain"
      />
      <span className="pointer-events-none absolute bottom-0.5 right-0.5 p-0.5 bg-black/60 text-white rounded">
        <Maximize2 className="w-2.5 h-2.5" aria-hidden="true" />
      </span>
    </button>
  );
}

export function AdCard({
  ad,
  busy,
  disabled,
  status,
  onAction,
  onIgnore,
}: {
  ad: BarCard<CampaignAd>;
  busy: boolean;
  disabled: boolean;
  status: ActionStatus;
  onAction: (ad: BarCard<CampaignAd>, action: CampaignAdAction) => void;
  onIgnore: (ad: BarCard<CampaignAd>) => void;
}) {
  const action = ad.action;
  const tag = CATEGORY_TAG[ad.category] ?? CATEGORY_TAG.untested;
  // Archived reads exactly like Ignored: faded, label only, no actions.
  const isInactive = status === "ignored" || status === "archived";
  const [previewOpen, setPreviewOpen] = useState(false);
  const hasPreview = Boolean(action?.before || action?.after);

  const metricItems: { label: string; value: string }[] = [];
  const metrics = ad.metrics ?? {};
  if (metrics.daysActive !== undefined) {
    metricItems.push({ label: "Days", value: String(metrics.daysActive) });
  }
  if (metrics.impressions !== undefined) {
    metricItems.push({
      label: "Impr.",
      value: formatCompact(metrics.impressions),
    });
  }
  if (metrics.cpa) metricItems.push({ label: "CPA", value: metrics.cpa });
  if (metrics.roas) {
    metricItems.push({ label: "ROAS", value: formatRoas(metrics.roas) });
  }

  return (
    <article
      className={`h-full flex flex-col border border-border bg-card rounded-none p-3 space-y-2 ${
        isInactive ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex flex-1 items-start gap-2.5">
          <AdMedia ad={ad} />

          <div className="min-w-0 flex-1 space-y-1">
            <h4 className="text-[12.5px] font-semibold text-foreground leading-snug break-words line-clamp-1">
              {ad.name}
            </h4>
            {ad.siblingComparison && (
              <p className="text-[11.5px] text-foreground/80 leading-snug break-words line-clamp-2">
                {ad.siblingComparison}
              </p>
            )}
            {ad.resultShare && (
              <p className="text-[11px] text-muted-foreground leading-snug break-words line-clamp-1">
                {ad.resultShare}
              </p>
            )}
          </div>
        </div>

        <span
          className={`shrink-0 inline-flex items-center text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-none ${tag.className}`}
        >
          {tag.label}
        </span>
      </div>

      {metricItems.length > 0 && (
        <div className="grid grid-cols-4 gap-2 py-1.5 tabular-nums">
          {metricItems.map((metric) => (
            <div key={metric.label} className="flex flex-col min-w-0">
              <span className="text-[9.5px] uppercase font-mono text-muted-foreground truncate">
                {metric.label}
              </span>
              <span className="font-bold text-[11.5px] text-foreground truncate">
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {action?.fix && (
        <div className="bg-muted border border-border-subtle rounded-xl p-3 text-[12.5px]">
          <p className="text-foreground leading-relaxed font-medium line-clamp-2">
            {action.fix}
          </p>
        </div>
      )}

      {hasPreview && (
        <div>
          <button
            type="button"
            onClick={() => setPreviewOpen((open) => !open)}
            aria-expanded={previewOpen}
            className={`w-full flex items-center justify-between gap-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none ${FOCUS_RING}`}
          >
            <span className="text-foreground/80">View changes preview</span>
            <ChevronDown
              className={`shrink-0 w-3.5 h-3.5 text-muted-2 transition-transform duration-250 ease-in-out ${
                previewOpen ? "rotate-180 text-foreground/80" : ""
              }`}
              aria-hidden="true"
            />
          </button>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-250 ease-in-out ${
              previewOpen
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0 pointer-events-none"
            }`}
          >
            <div className="overflow-hidden">
              <div className="pt-2 space-y-2 text-[11px]">
                {action?.before && (
                  <div className="bg-card border border-border rounded-xl p-2.5 space-y-1 shadow-2xs">
                    <span className="inline-block text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                      Before
                    </span>
                    <p className="text-foreground/80 leading-relaxed font-normal">
                      {action.before}
                    </p>
                  </div>
                )}

                {action?.after && (
                  <div className="bg-success-tint/40 border border-success-border rounded-xl p-2.5 space-y-1 shadow-2xs">
                    <span className="inline-block text-[9.5px] font-bold uppercase tracking-wider text-brand font-mono bg-success-tint px-1.5 py-0.5 rounded">
                      After
                    </span>
                    <p className="text-brand leading-relaxed font-medium">
                      {action.after}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {ad.value && (
        <p className="text-[11px] font-semibold text-brand leading-snug break-words line-clamp-1">
          {ad.value}
        </p>
      )}

      {isInactive ? (
        <div className="mt-auto flex justify-end">
          <span className="text-[10.5px] font-semibold uppercase tracking-tight text-muted-2">
            {status === "archived" ? "Archived" : "Ignored"}
          </span>
        </div>
      ) : status === "completed" ? (
        <div className="mt-auto flex items-center justify-end gap-1 text-brand">
          <Check className="w-3 h-3" aria-hidden="true" />
          <span className="text-[10.5px] font-semibold uppercase tracking-tight">
            Completed
          </span>
        </div>
      ) : action ? (
        <div className="mt-auto flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onIgnore(ad)}
            disabled={disabled}
            className={`${SECONDARY_BUTTON} ${FOCUS_RING}`}
          >
            <span>Ignore</span>
          </button>

          <button
            type="button"
            onClick={() => onAction(ad, action)}
            disabled={disabled}
            className={`${PRIMARY_BUTTON} ${FOCUS_RING}`}
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            ) : null}
            <span>Fix with AI</span>
          </button>
        </div>
      ) : null}
    </article>
  );
}

