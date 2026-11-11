"use client";

/**
 * Transcript loader for initial conversation load and older-turn pagination.
 *
 * The application's two variants, unchanged. The animated head comes from the
 * sibling avatar module so the package has one bot implementation.
 *
 * @module @openai-harness/client-ui-chat/client/bot/bot.doll.loader
 */

import type { LoaderOwnerProps } from "../types";
import { BotDollAvatar } from "./bot.doll.avatar";

/** Props accepted by the loader seat. */
export type BotDollLoaderProps = LoaderOwnerProps;

/**
 * Render the bot loader.
 * @param props - variant, copy, size, and optional avatar override.
 * @returns a compact top banner or a centered initial-load state.
 */
export function BotDollLoader({
  variant = "top-banner",
  text,
  subtitle,
  size,
  avatarUrl,
  className = "",
  sessionId,
}: BotDollLoaderProps) {
  if (variant === "top-banner") {
    return (
      <div
        className={`w-full flex items-center justify-center py-2 animate-in fade-in duration-300 ${className}`}
      >
        <div className="inline-flex items-center gap-2 transition-all">
          <BotDollAvatar
            size={size ?? 20}
            avatarUrl={avatarUrl}
            sessionId={sessionId}
            withShadow={false}
          />
          <span className="text-[11.5px] font-medium text-muted-foreground tracking-tight">
            {text || "Loading earlier messages..."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center min-h-[320px] text-muted-foreground gap-3.5 animate-in fade-in duration-300 ${className}`}
    >
      <BotDollAvatar
        size={size ?? 56}
        avatarUrl={avatarUrl}
        sessionId={sessionId}
        withShadow={true}
      />
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-muted-foreground font-semibold tracking-wide">
          {text || "Loading conversation"}
        </span>
        <span className="text-[10.5px] text-muted-foreground font-normal">
          {subtitle ?? "Preparing marketing assets and chat history"}
        </span>
      </div>
    </div>
  );
}
