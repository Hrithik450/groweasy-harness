"use client";

import { Loader2 } from "lucide-react";

export interface DetailBarLoadOlderProps {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  className?: string;
}

/** Bottom-of-list pagination control shared by every detail-bar list. */
export function DetailBarLoadOlder({
  hasMore,
  isLoading,
  onLoadMore,
  className = "",
}: DetailBarLoadOlderProps) {
  if (!hasMore) return null;

  return (
    <button
      type="button"
      onClick={onLoadMore}
      disabled={isLoading}
      className={`w-full h-9 rounded-xl border border-border bg-card text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer ${className}`}
    >
      {isLoading ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Loading...</span>
        </span>
      ) : (
        "Load older"
      )}
    </button>
  );
}
