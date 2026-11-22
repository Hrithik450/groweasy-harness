"use client";

import { useEffect, useState } from "react";
import type { SessionSlug } from "@/lib/db";
import {
  BotDollAvatar,
  botVariantForRole,
  type BotDollVariant,
} from "./bot.doll.loader";

/** Short status lines rotated while the agent works, one set per bar. */
const THINKING_LINES: Record<SessionSlug, readonly string[]> = {
  adStrategist: [
    "Reading competitor ads",
    "Ranking angles",
    "Checking campaign data",
    "Mapping audience segments",
    "Scanning market trends",
    "Comparing creative hooks",
    "Reviewing brand positioning",
    "Sizing up the competition",
    "Drafting the strategy",
    "Finding the winning wedge",
  ],
  adManager: [
    "Auditing spend",
    "Checking campaign health",
    "Reviewing alerts",
    "Comparing ad performance",
    "Finding wasted spend",
    "Ranking campaigns",
    "Checking budget pacing",
    "Scanning account health",
    "Sizing up winners",
    "Preparing recommendations",
  ],
  adCreator: [
    "Reviewing winning ads",
    "Shaping the hook",
    "Sketching ad concepts",
    "Writing the headline",
    "Matching brand voice",
    "Picking the format",
    "Studying competitor creative",
    "Drafting the script",
    "Choosing visuals",
    "Polishing the copy",
  ],
  businessProfile: [
    "Reading your website",
    "Refreshing the brand profile",
    "Checking competitors",
    "Sharpening keywords",
    "Reviewing brand voice",
    "Comparing market data",
    "Updating product details",
    "Mapping the niche",
    "Finding new competitors",
    "Polishing the profile",
  ],
};

const ROTATE_MS = 2400;

function linesForSlug(slug?: string | null): readonly string[] {
  return slug && slug in THINKING_LINES
    ? THINKING_LINES[slug as SessionSlug]
    : THINKING_LINES.adManager;
}

/** Stable start offset so two bars rarely begin on the same line. */
function startIndex(slug: string | null | undefined, count: number): number {
  if (count <= 0) return 0;
  let hash = 0;
  for (const char of slug ?? "") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % count;
}

interface ChiefThinkingProps {
  agentName?: string;
  slug?: string | null;
  avatarVariant?: BotDollVariant;
}

/** Inline "still working" row shown while the agent is thinking. */
export function ChiefThinking({
  agentName,
  slug,
  avatarVariant,
}: ChiefThinkingProps) {
  const lines = linesForSlug(slug);
  const [index, setIndex] = useState(() => startIndex(slug, lines.length));

  useEffect(() => {
    setIndex(startIndex(slug, lines.length));
  }, [slug, lines.length]);

  useEffect(() => {
    if (lines.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [lines.length]);

  const line = lines[index] ?? lines[0] ?? "Thinking";

  return (
    <div
      aria-busy="true"
      className="flex items-center gap-2.5 mb-2 py-1 px-1 w-full max-w-full transition-all duration-200"
    >
      <BotDollAvatar
        size={20}
        withShadow={false}
        variant={avatarVariant ?? botVariantForRole(agentName ?? slug)}
      />
      <span className="font-display font-medium text-foreground tracking-wide text-sm h-5 leading-5 min-w-0 truncate">
        {line}…
      </span>
    </div>
  );
}
