"use client";

/**
 * Turn chat node.
 *
 * Keeps the app's turn wrapper, ordering, error/aborted banners, and the
 * completed usage footer. Inputs and the settled answer dispatch through the
 * `user` and `assistant` node keys, so either message-level renderer can be
 * replaced without changing the turn frame.
 *
 * @module @openai-harness/client-ui-chat/client/TurnNode
 */

import { Fragment } from "react";
import {
  AlertTriangle,
  Clock,
  Coins,
  StopCircle,
} from "lucide-react";
import type { ChatNodeOwnerProps } from "./types";
import { UserMessageNode } from "./UserMessageNode";
import { AssistantMessageNode } from "./AssistantMessageNode";

/**
 * Render one complete turn.
 * @param props - the turn, its live/streaming state, and bound message seats.
 * @returns the turn frame.
 */
export function TurnNode({
  turn,
  isStreamingTurn = false,
  isLatestTurn = true,
  onActionComplete,
  onBlockValueChange,
  renderUserMessage,
  renderAssistantMessage,
}: ChatNodeOwnerProps) {
  return (
    <div
      id={`turn-${turn.turn}`}
      data-turn={turn.turn}
      // Message ids anchored here let the detail bar jump back to the turn
      // that produced a saved card.
      data-message-ids={[
        turn.finalAnswer?.id,
        ...turn.inputs.map((input) => input.id),
      ]
        .filter(Boolean)
        .join(" ")}
      className="flex flex-col gap-3 mb-6 w-full min-w-0"
    >
      {/* 1. User Prompt Inputs */}
      {turn.inputs.map((input) => (
        <Fragment key={input.id}>
          {renderUserMessage?.(input) ?? <UserMessageNode turn={turn} input={input} />}
        </Fragment>
      ))}

      {/* 2. Settled Assistant Answer (Markdown + Generative UI) */}
      {turn.finalAnswer !== undefined &&
        (renderAssistantMessage?.(turn.finalAnswer) ?? (
          <AssistantMessageNode
            turn={turn}
            isStreamingTurn={isStreamingTurn}
            isLatestTurn={isLatestTurn}
            onActionComplete={onActionComplete}
            onBlockValueChange={onBlockValueChange}
          />
        ))}

      {/* 4. Turn Status / Error / Aborted Banner */}
      {turn.status === "error" && (
        <div className="flex items-center gap-2 p-3 rounded-none bg-destructive-tint border border-destructive/25 text-xs text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
          <span>{turn.error || "Turn execution failed"}</span>
        </div>
      )}

      {turn.status === "aborted" && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
          <StopCircle className="w-3.5 h-3.5" />
          <span>Turn was stopped</span>
        </div>
      )}

      {/* 5. Completed Turn Footer (Tokens & Duration) */}
      {turn.status === "completed" &&
        ((turn.durationMs ?? 0) > 0 || turn.usage !== undefined) && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
            <div className="flex items-center gap-3">
              {turn.durationMs !== undefined && turn.durationMs > 0 && (
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  {(turn.durationMs / 1000).toFixed(1)}s
                </span>
              )}

              {turn.usage && (
                <span className="flex items-center gap-1 font-mono">
                  <Coins className="w-3 h-3 text-muted-foreground" />
                  {turn.usage.totalTokens} tokens
                </span>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
