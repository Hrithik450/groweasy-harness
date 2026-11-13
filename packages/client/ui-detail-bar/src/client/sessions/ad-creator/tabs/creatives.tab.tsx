"use client";

import { useState } from "react";
import { Film, Play } from "lucide-react";
import type {
  DetailBarTabProps,
  AdCreatorCreative,
  AdCreatorDetailBarData,
} from "../../../../types";
import { DetailBarEmptyState } from "../../../common";
import { DEMO_AD_CREATOR_CREATIVES } from "../../../demo";

type CreativeFilter = "all" | "static" | "video" | "live";

const FILTERS: { id: CreativeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "static", label: "Statics" },
  { id: "video", label: "Videos" },
  { id: "live", label: "Live" },
];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const PREVIEW_CLASS: Record<
  NonNullable<AdCreatorCreative["previewKind"]>,
  string
> = {
  ink: "bg-foreground text-background",
  brand: "bg-brand text-primary-foreground",
  accent: "bg-accent text-foreground",
  tan: "bg-secondary text-foreground border border-border-strong",
};

function matchesFilter(
  creative: AdCreatorCreative,
  filter: CreativeFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "live") return creative.isLive === true;
  if (filter === "static") return creative.type === "image";
  return creative.type === "video";
}

export function CreativesTab({
  detailBar,
}: DetailBarTabProps<AdCreatorDetailBarData>) {
  const [filter, setFilter] = useState<CreativeFilter>("all");

  const rawCreatives = detailBar.data.creatives || [];
  const creatives =
    rawCreatives.length > 0 ? rawCreatives : DEMO_AD_CREATOR_CREATIVES;
  const filteredCreatives = creatives.filter((creative) =>
    matchesFilter(creative, filter),
  );

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((option) => {
          const isActive = filter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={isActive}
              className={`px-2.5 py-1 rounded-none text-[12px] font-semibold transition-colors cursor-pointer ${
                isActive
                  ? "bg-brand text-primary-foreground border border-brand"
                  : "bg-card text-foreground border border-input hover:bg-muted"
              } ${FOCUS_RING}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {filteredCreatives.length === 0 ? (
        <DetailBarEmptyState
          icon={Film}
          title="No matching creatives"
          description="No creatives match this filter yet."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredCreatives.map((creative) => {
            const isVideo = creative.type === "video";
            const previewKind = creative.previewKind ?? "ink";
            const statusLine =
              creative.statusLine ??
              (creative.isLive
                ? "Live"
                : creative.status === "Draft"
                  ? "Draft · today"
                  : "Ready");
            const typeLabel = `${isVideo ? "Video" : "Static"}${
              creative.duration ? ` · ${creative.duration}` : ""
            }`;

            return (
              <div
                key={creative.id}
                className="min-w-0 flex flex-col gap-1.5"
              >
                <div
                  className={`aspect-square relative flex items-center justify-center rounded-none ${PREVIEW_CLASS[previewKind]}`}
                >
                  <span className="absolute left-2 top-2 px-2 py-0.5 bg-card text-foreground text-[11px] font-bold rounded-none">
                    {typeLabel}
                  </span>
                  {isVideo && (
                    <Play
                      className="w-7 h-7"
                      fill="currentColor"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <span className="text-[12px] font-semibold text-foreground leading-snug break-words">
                  {creative.title}
                </span>
                <span
                  className={`text-[11px] leading-snug break-words ${
                    creative.isLive
                      ? "text-success font-semibold"
                      : "text-muted-foreground font-medium"
                  }`}
                >
                  {statusLine}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
