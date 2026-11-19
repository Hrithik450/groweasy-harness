"use client";

import type { DefaultSessionTabProps } from "../types";

/** Overview tab for a session with no preset: shows the basics it has. */
export function OverviewTab({ session }: DefaultSessionTabProps) {
  return (
    <div className="space-y-2 p-4 text-sm">
      <div className="text-muted-foreground">Session</div>
      <div className="font-medium">{session?.title ?? "Untitled session"}</div>
    </div>
  );
}
