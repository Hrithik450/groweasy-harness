"use client";

import { Sparkles } from "lucide-react";
import { useBarPager } from "@/hooks/use.bar.pager";
import { groupByDay } from "@/lib/utils/day.group";
import { buildIdeaPrompt } from "@/lib/prompts/idea";
import {
  DetailBarEmptyState,
  DetailBarLoadOlder,
} from "@/components/detail.bar/common";
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

/** Idea backlog for an ad-creator session: one card per row. */
export function IdeasTab({
  session,
  isStreaming,
  handleSubmit,
}: AdCreatorTabProps) {
  const pager = useBarPager<Idea>(session?.id, "ideas");
  const groups = groupByDay(pager.items, (idea) => idea.createdAt);

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
    <div className="space-y-3 pb-6 font-sans">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider font-sans text-muted-foreground">
              {group.label}
            </span>
            <span className="flex-1 h-px bg-border" />
            <span className="shrink-0 text-[10.5px] font-sans text-muted-2">
              {group.items.length} {group.items.length === 1 ? "Idea" : "Ideas"}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {group.items.map((idea) => {
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
              // Rows saved before the source rename kept the old category chip.
              const sourceLabel =
                idea.source ??
                (idea as unknown as { category?: string }).category ??
                "IDEA";
              const hasDetails = Boolean(
                formatLabel || idea.hook || idea.makeFor || idea.why,
              );

              return (
                <article
                  key={idea.id}
                  className="min-w-0 flex items-start gap-3 overflow-hidden rounded-2xl border border-border bg-card p-2.5 shadow-2xs transition-all hover:border-brand/40 hover:shadow-sm"
                >
                  <div className="relative w-[132px] sm:w-[148px] lg:w-[160px] shrink-0 self-start aspect-[4/5] overflow-hidden rounded-xl border border-border/70 bg-muted">
                    {idea.mediaUrl ? (
                      <IdeaMedia
                        url={idea.mediaUrl}
                        format={idea.format}
                        title={idea.title}
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
                        <Sparkles
                          className="w-6 h-6 opacity-50"
                          aria-hidden="true"
                        />
                        <span className="text-[10px] font-sans uppercase tracking-tight">
                          {idea.format === "video"
                            ? "Video idea"
                            : "Static idea"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
                    <span className="inline-flex w-fit items-center text-[9.5px] font-bold tracking-[0.06em] uppercase font-sans bg-muted/90 text-muted-foreground border border-border/70 px-1.5 py-0.5 rounded-md">
                      {sourceLabel}
                    </span>

                    <h3 className="text-[13px] font-bold tracking-tight text-foreground leading-snug break-words line-clamp-2">
                      {idea.title}
                    </h3>

                    <p className="text-[12px] text-muted-foreground leading-snug break-words line-clamp-2">
                      {idea.description}
                    </p>

                    {hasDetails && (
                      <dl className="mt-0.5 space-y-1.5 text-[11px] leading-snug break-words">
                        {formatLabel && (
                          <div>
                            <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Format
                            </dt>
                            <dd className="text-foreground/80">
                              {formatLabel}
                            </dd>
                          </div>
                        )}
                        {idea.hook && (
                          <div>
                            <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Hook
                            </dt>
                            <dd className="text-foreground/80">{idea.hook}</dd>
                          </div>
                        )}
                        {idea.makeFor && (
                          <div>
                            <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                              What we make
                            </dt>
                            <dd className="text-foreground/80">
                              {idea.makeFor}
                            </dd>
                          </div>
                        )}
                        {idea.why && (
                          <div>
                            <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Why
                            </dt>
                            <dd className="text-foreground/80">{idea.why}</dd>
                          </div>
                        )}
                      </dl>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const draft = buildIdeaPrompt(idea);
                        handleSubmit?.(draft.content, {
                          source: "detail-bar",
                          display: draft.display,
                        });
                      }}
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
