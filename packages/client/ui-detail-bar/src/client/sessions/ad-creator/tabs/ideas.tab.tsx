"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type {
  DetailBarTabProps,
  AdCreatorDetailBarData,
  AdCreatorIdea,
} from "../../../../types";
import { DetailBarEmptyState } from "../../../common";
import { DEMO_AD_CREATOR_IDEAS } from "../../../demo";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function IdeasTab({
  detailBar,
  isStreaming,
  handleSubmit,
}: DetailBarTabProps<AdCreatorDetailBarData>) {
  const rawIdeas = detailBar.data.ideas || [];
  const ideas = rawIdeas.length > 0 ? rawIdeas : DEMO_AD_CREATOR_IDEAS;
  const [loadingIdeaId, setLoadingIdeaId] = useState<string | null>(null);

  const handleMakeAds = async (concept: AdCreatorIdea) => {
    if (loadingIdeaId || isStreaming) return;
    setLoadingIdeaId(concept.id);

    try {
      const prompt = `Generate 3 ad creatives for the concept: "${concept.title}" (${concept.description})`;
      await handleSubmit?.(prompt);
    } catch (err) {
      console.error("Failed to generate creatives from idea:", err);
    } finally {
      setLoadingIdeaId(null);
    }
  };

  if (ideas.length === 0) {
    return (
      <DetailBarEmptyState
        icon={Sparkles}
        title="No Ideas Found"
        description="No creative concepts generated yet. Ask the assistant to brainstorm creative hooks, angles, and ad copy."
      />
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Subheader */}
      <div className="text-[13px] text-muted-foreground font-normal pb-0.5">
        Concepts from the latest brief
      </div>

      {/* Idea Cards List */}
      <div className="space-y-3.5">
        {ideas.map((concept) => {
          const isLoading = loadingIdeaId === concept.id;
          const isDisabled = Boolean(loadingIdeaId) || isStreaming;

          return (
            <div
              key={concept.id}
              className="border border-border bg-card rounded-none p-3.5 flex flex-col gap-1.5"
            >
              {/* Category label */}
              <div className="text-[11px] font-bold tracking-[0.06em] text-foreground uppercase font-mono">
                {concept.category}
              </div>

              {/* Title */}
              <h3 className="font-bold text-[13px] text-foreground leading-snug tracking-tight break-words">
                {concept.title}
              </h3>

              {/* Description */}
              <p className="text-[12.5px] text-muted-foreground leading-relaxed font-normal break-words">
                {concept.description}
              </p>

              {/* Action Button: Make ads with local loader */}
              <button
                type="button"
                onClick={() => handleMakeAds(concept)}
                disabled={isDisabled}
                className={`mt-1 self-start min-h-9 px-3 py-1.5 bg-foreground hover:bg-brand-hover text-background text-[12px] font-bold rounded-none transition-colors cursor-pointer inline-flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <span>Make ads</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
