"use client";

import { useState } from "react";
import { Film } from "lucide-react";
import { useBarPager } from "@/hooks/use.bar.pager";
import { groupByDay } from "@/lib/utils/day.group";
import {
  DetailBarEmptyState,
  DetailBarLoadOlder,
} from "@/components/detail.bar/common";
import type { Creative } from "@/lib/detail.bar/types";
import type { AdCreatorTabProps } from "../types";

type CreativeFilter = "all" | "image" | "video";

const FILTERS: { id: CreativeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Statics" },
  { id: "video", label: "Videos" },
];

/** Generated creatives for an ad-creator session. */
export function CreativesTab({ data, session }: AdCreatorTabProps) {
  const [filter, setFilter] = useState<CreativeFilter>("all");
  const pager = useBarPager(session?.id ?? "", "creatives", data?.creatives ?? []);

  const creatives = pager.items.filter(
    (creative) => filter === "all" || creative.type === filter,
  );
  const groups = groupByDay(creatives, (creative) => creative.createdAt);

  return (
    <div className="space-y-3 pb-6">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((option) => {
          const isActive = filter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={isActive}
              className={`px-2.5 py-1 rounded-xl text-[12px] font-semibold transition-colors cursor-pointer ${
                isActive
                  ? "bg-brand text-primary-foreground border border-brand"
                  : "bg-card text-foreground border border-input hover:bg-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {pager.items.length === 0 ? (
        <DetailBarEmptyState
          icon={Film}
          title="No creatives yet"
          description="Generated statics and videos appear here once the Ad Creator makes them."
        />
      ) : creatives.length === 0 ? (
        <DetailBarEmptyState
          icon={Film}
          title="No matching creatives"
          description="No creatives match this filter yet."
        />
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider font-mono text-muted-foreground">
                {group.label}
              </span>
              <span className="flex-1 h-px bg-border" />
              <span className="shrink-0 text-[10.5px] font-mono text-muted-2">
                {group.items.length}{" "}
                {group.items.length === 1 ? "Creative" : "Creatives"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {group.items.map((creative) => (
                <CreativeTile key={creative.id} creative={creative} />
              ))}
            </div>
          </section>
        ))
      )}

      <DetailBarLoadOlder
        hasMore={pager.hasMore}
        isLoading={pager.isLoading}
        onLoadMore={pager.loadMore}
      />
    </div>
  );
}

/** One finished asset: a fixed preview box the file letterboxes itself into. */
export function CreativeTile({ creative }: { creative: Creative }) {
  const isVideo = creative.type === "video";
  const mediaClass = "absolute inset-0 h-full w-full object-contain";

  return (
    <article className="h-full min-w-0 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {isVideo ? (
          <video
            src={creative.mediaUrl}
            controls
            muted
            playsInline
            preload="metadata"
            className={mediaClass}
          />
        ) : (
          <img
            src={creative.mediaUrl}
            alt={creative.title}
            loading="lazy"
            className={mediaClass}
          />
        )}
        <span className="absolute left-2 top-2 px-1.5 py-0.5 bg-card/90 text-foreground text-[9.5px] font-bold uppercase tracking-tight font-mono rounded-md">
          {isVideo ? "Video" : "Static"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-[12px] font-semibold text-foreground leading-snug break-words line-clamp-1">
          {creative.title}
        </span>
        <span className="text-[11px] leading-snug break-words text-muted-foreground font-medium line-clamp-2">
          {creative.description}
        </span>
      </div>
    </article>
  );
}
