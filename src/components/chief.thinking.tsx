"use client";

import type { SessionSlug } from "@/lib/db";
import {
  BotDollAvatar,
  botVariantForRole,
  type BotDollVariant,
} from "./bot.doll.loader";

/**
 * One static line per session. The live status lives in the process list above
 * the composer, so this row stays constant — no rotation, no dynamic text.
 */
const THINKING_LABEL: Record<SessionSlug, string> = {
  adStrategist: "Ad Strategist is working",
  adManager: "Ad Manager is working",
  adCreator: "Ad Creator is working",
  businessProfile: "Business Profile is working",
};

const DEFAULT_LABEL = "Working";

function labelForSlug(slug?: string | null): string {
  return (slug && slug in THINKING_LABEL
    ? THINKING_LABEL[slug as SessionSlug]
    : DEFAULT_LABEL);
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
  return (
    <div
      aria-busy="true"
      className="flex items-center gap-2.5 mb-2 py-1 px-1 w-full max-w-full"
    >
      <BotDollAvatar
        size={20}
        withShadow={false}
        variant={avatarVariant ?? botVariantForRole(agentName ?? slug)}
      />
      <span className="font-display font-medium text-foreground tracking-wide text-sm h-5 leading-5 min-w-0 truncate">
        {labelForSlug(slug)}…
      </span>
    </div>
  );
}
