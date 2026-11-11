"use client";

/**
 * Empty-conversation seat.
 *
 * The app's suggestion grid, unchanged. The title and avatar arrive as owner
 * props: the title from the conversation owner (store or server session), the
 * avatar from the bound avatar seat.
 *
 * @module @openai-harness/client-ui-chat/client/ChatEmptyState
 */

import { Clock, Compass, Palette, Sparkles } from "lucide-react";
import type { EmptyOwnerProps } from "./types";

/**
 * Render the empty conversation state.
 * @param props - title, prompt callback, and the bound avatar seat.
 * @returns the centered suggestion grid.
 */
export function ChatEmptyState({
  sessionId,
  title: propTitle,
  onSelectPrompt,
  renderAvatar,
}: EmptyOwnerProps) {
  const title = propTitle || "Ad Specialist";

  const suggestions = [
    {
      icon: Compass,
      title: "Competitor research & strategy",
      prompt:
        "Analyze the top competitors in our niche and suggest our winning ad strategy",
    },
    {
      icon: Palette,
      title: "Generate poster & video creatives",
      prompt:
        "Create an eye-catching marketing poster and fast-cut video ad for our product",
    },
    {
      icon: Sparkles,
      title: "Campaign brief & target audiences",
      prompt:
        "Generate a targeted campaign brief with high-converting Facebook audience segments",
    },
    {
      icon: Clock,
      title: "Schedule daily automation",
      prompt: "Set up a daily automated marketing review at 9:00 AM",
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 overflow-y-auto w-full">
      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        {renderAvatar !== undefined && (
          <div className="mb-4">
            {renderAvatar({ size: 56, withShadow: true, sessionId })}
          </div>
        )}

        <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-8 sm:mb-9 tracking-tight">
          How can {title} help you today?
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {suggestions.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectPrompt(item.prompt)}
                className="flex items-center gap-3 p-3.5 rounded-none bg-card border border-border hover:border-foreground/40 hover:bg-muted hover:scale-[1.015] active:scale-[0.98] text-foreground hover:text-foreground transition-all duration-200 ease-out text-left group cursor-pointer transform-gpu"
              >
                <div className="p-2.5 rounded-none bg-secondary border border-border text-muted-foreground group-hover:bg-brand group-hover:text-primary-foreground group-hover:border-brand transition-all duration-200 shrink-0">
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate group-hover:text-foreground">
                    {item.title}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                    {item.prompt}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
