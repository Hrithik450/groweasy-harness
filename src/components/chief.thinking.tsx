import { BotDollAvatar } from "./bot.doll.loader";

interface ChiefThinkingProps {
  agentName?: string;
}

/** Inline "still working" row shown while the agent is thinking. */
export function ChiefThinking({ agentName }: ChiefThinkingProps) {
  return (
    <div className="flex items-center gap-2.5 mb-2 py-1 px-1 w-full max-w-full transition-all duration-200">
      <BotDollAvatar size={20} withShadow={false} />
      <span className="font-display font-medium text-foreground tracking-wide text-sm">
        {agentName ? `${agentName} is thinking...` : "I'm thinking..."}
      </span>
    </div>
  );
}
