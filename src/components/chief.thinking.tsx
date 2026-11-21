import {
  BotDollAvatar,
  botVariantForRole,
  type BotDollVariant,
} from "./bot.doll.loader";

interface ChiefThinkingProps {
  agentName?: string;
  avatarVariant?: BotDollVariant;
}

/** Inline "still working" row shown while the agent is thinking. */
export function ChiefThinking({ agentName, avatarVariant }: ChiefThinkingProps) {
  return (
    <div className="flex items-center gap-2.5 mb-2 py-1 px-1 w-full max-w-full transition-all duration-200">
      <BotDollAvatar
        size={20}
        withShadow={false}
        variant={avatarVariant ?? botVariantForRole(agentName)}
      />
      <span className="font-display font-medium text-foreground tracking-wide text-sm">
        {agentName ? `${agentName} is thinking...` : "I'm thinking..."}
      </span>
    </div>
  );
}
