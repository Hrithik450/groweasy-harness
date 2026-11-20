"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { useBarPager } from "@/hooks/use.bar.pager";
import { groupByDay } from "@/lib/utils/day.group";
import { DetailBarEmptyState, DetailBarLoadOlder } from "@/components/detail.bar/common";
import type { Idea } from "@/lib/detail.bar/types";
import type { AdCreatorTabProps } from "../types";

/** The ad an idea is modelled on, whole inside a fixed box (never cropped). */
function IdeaMedia({
  url,
  format,
  title,
}: {
  url: string;
  format?: "video" | "image";
  title: string;
}) {
  const isVideo = format === "video" || /\.(mp4|mov|webm|m4v)$/i.test(url);
  const mediaClass = "absolute inset-0 h-full w-full object-contain";

  return isVideo ? (
    <video
      src={url}
      controls
      muted
      playsInline
      preload="metadata"
      className={mediaClass}
    />
  ) : (
    <img src={url} alt={title} loading="lazy" className={mediaClass} />
  );
}

/** Idea backlog for an ad-creator session: two equal cards per row. */
export function IdeasTab({ session, isStreaming, handleSubmit }: AdCreatorTabProps) {
  const pager = useBarPager<Idea>(session?.id, "ideas");
  const groups = groupByDay(pager.items, (idea) => idea.createdAt);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  if (pager.items.length === 0) {
    return (
      <DetailBarEmptyState
        icon={Sparkles}
        title="No ideas yet"
        description="The Ad Creator writes new concepts every day. Ask the assistant to brainstorm hooks and angles for your brand."
      />
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider font-mono text-muted-foreground">
              {group.label}
            </span>
            <span className="flex-1 h-px bg-border" />
            <span className="shrink-0 text-[10.5px] font-mono text-muted-2">
              {group.items.length}{" "}
              {group.items.length === 1 ? "Idea" : "Ideas"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {group.items.map((idea) => {
          const isOpen = Boolean(openIds[idea.id]);
          const formatLabel = [
            idea.format === "video"
              ? "Video"
              : idea.format === "image"
                ? "Static"
                : "",
            idea.aspectRatio,
          ]
            .filter(Boolean)
            .join(" · ");
          const hasDetails = Boolean(
            formatLabel || idea.hook || idea.makeFor || idea.why,
          );

          return (
          <article
            key={idea.id}
            className="h-full min-w-0 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xs transition-all hover:border-brand/40 hover:shadow-sm"
          >
            <div className="relative aspect-[4/5] overflow-hidden bg-muted">
              {idea.mediaUrl ? (
                <IdeaMedia
                  url={idea.mediaUrl}
                  format={idea.format}
                  title={idea.title}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                  <Sparkles className="w-5 h-5 opacity-50" aria-hidden="true" />
                  <span className="text-[9.5px] font-mono uppercase tracking-tight">
                    {idea.format === "video" ? "Video idea" : "Static idea"}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-3">
              <span className="inline-flex w-fit items-center text-[9.5px] font-bold tracking-[0.06em] uppercase font-mono bg-muted/90 text-muted-foreground border border-border/70 px-1.5 py-0.5 rounded-md">
                {idea.category}
              </span>

              <h3 className="text-[12.5px] font-bold tracking-tight text-foreground leading-snug break-words line-clamp-1">
                {idea.title}
              </h3>

              <p className="text-[11.5px] text-muted-foreground leading-snug break-words line-clamp-2">
                {idea.description}
              </p>

              {hasDetails && (
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenIds((prev) => ({
                        ...prev,
                        [idea.id]: !prev[idea.id],
                      }))
                    }
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
                  >
                    <span className="text-foreground/80">View more</span>
                    <ChevronDown
                      className={`shrink-0 w-3.5 h-3.5 text-muted-2 transition-transform duration-250 ease-in-out ${
                        isOpen ? "rotate-180 text-foreground/80" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-250 ease-in-out ${
                      isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0 pointer-events-none"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="pt-1 space-y-1.5 text-[11px] leading-snug break-words text-muted-foreground">
                        {formatLabel && (
                          <p>
                            <span className="font-semibold text-foreground">
                              Format:
                            </span>{" "}
                            {formatLabel}
                          </p>
                        )}
                        {idea.hook && (
                          <p>
                            <span className="font-semibold text-foreground">
                              Hook:
                            </span>{" "}
                            {idea.hook}
                          </p>
                        )}
                        {idea.makeFor && (
                          <p>
                            <span className="font-semibold text-foreground">
                              What we make:
                            </span>{" "}
                            {idea.makeFor}
                          </p>
                        )}
                        {idea.why && (
                          <p>
                            <span className="font-semibold text-foreground">
                              Why:
                            </span>{" "}
                            {idea.why}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  handleSubmit?.(
                    `Generate 3 ad creatives for the concept: "${idea.title}" (${idea.description})`,
                  )
                }
                disabled={isStreaming}
                className="mt-auto w-full min-h-8 px-2 py-1.5 bg-foreground hover:bg-brand text-background text-[11.5px] font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Make ad
              </button>
            </div>
          </article>
          );
            })}
          </div>
        </section>
      ))}

      <DetailBarLoadOlder
        hasMore={pager.hasMore}
        isLoading={pager.isLoading}
        onLoadMore={pager.loadMore}
      />
    </div>
  );
}
