"use client";

/**
 * Streaming thinking row shown below the last turn.
 *
 * The application's markup and copy, unchanged. The active `sessionId` reaches
 * the avatar so it keeps the session's role color.
 *
 * @module @openai-harness/client-ui-chat/client/bot/chief.thinking
 */

import type { ThinkingOwnerProps } from "../types";
import { BotDollAvatar } from "./bot.doll.avatar";

/**
 * Render the thinking row.
 * @param props - optional agent name, class override, and bound session id.
 * @returns the pulsing avatar-and-label row.
 */
export function ChiefThinking({
  agentName,
  className,
  sessionId,
}: ThinkingOwnerProps) {
  return (
    <div
      className={
        className ||
        "flex items-center space-x-2.5 mb-3 py-2 px-1 w-full max-w-full transition-all duration-200"
      }
    >
      <BotDollAvatar sessionId={sessionId} size={20} withShadow={false} />
      <span className="font-display font-medium text-muted-foreground animate-pulse tracking-wide text-sm">
        {agentName ? `${agentName} is thinking...` : "I'm thinking..."}
      </span>
    </div>
  );
}
