import { BotDollLoader } from "@/components/bot.doll.loader";

/** Matches `DetailBar`'s default width so the fallback does not jump. */
const DETAIL_BAR_WIDTH = 420;

/**
 * Fallback for a session page: the main column plus the detail bar it will
 * adopt, so the layout does not reflow when the real turn arrives.
 */
export function ChatSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Main Conversation Column */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        <header className="h-14 shrink-0 flex items-center justify-between border-b border-border bg-card px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-28 bg-secondary rounded-none animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-none bg-secondary animate-pulse" />
            <div className="h-8 w-8 rounded-none bg-secondary animate-pulse" />
          </div>
        </header>

        <BotDollLoader variant="center" text="Loading conversation" />

        <div className="px-4 pb-4 pt-1 sm:px-6 sm:pb-5 sm:pt-1 shrink-0">
          <div className="max-w-3xl mx-auto space-y-2 w-full">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <div className="h-6 w-24 bg-secondary rounded-none animate-pulse shrink-0" />
              <div className="h-6 w-28 bg-secondary rounded-none animate-pulse shrink-0" />
              <div className="h-6 w-20 bg-secondary rounded-none animate-pulse shrink-0" />
            </div>
            <div className="h-13 bg-card rounded-none border border-border flex items-center px-4">
              <div className="h-4 w-48 bg-secondary rounded-none animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Detail Bar Column */}
      <aside
        style={{ width: DETAIL_BAR_WIDTH }}
        className="hidden lg:flex flex-col h-full shrink-0 border-l border-border-subtle bg-card"
      >
        {/* Tab strip */}
        <div className="h-14 shrink-0 flex items-center gap-5 border-b border-border px-5">
          <div className="h-4 w-20 bg-secondary rounded-none animate-pulse" />
          <div className="h-4 w-14 bg-secondary rounded-none animate-pulse" />
          <div className="h-4 w-24 bg-secondary rounded-none animate-pulse" />
        </div>

        {/* Panel body */}
        <div className="flex-1 min-h-0 p-5 space-y-3">
          <div className="h-5 w-32 bg-secondary rounded-none animate-pulse" />
          <div className="h-24 w-full bg-muted border border-border rounded-none animate-pulse" />
          <div className="h-24 w-full bg-muted border border-border rounded-none animate-pulse" />
        </div>
      </aside>
    </div>
  );
}
