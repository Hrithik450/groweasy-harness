"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useDetailBarStore } from "@/store/detail.bar.store";
import type { DetailBarField } from "@/lib/detail.bar/fields";

/**
 * Reload one detail-bar tab from the server, replacing the seeded page.
 * Recovers cards whose stream event was missed (e.g. while another session
 * was open).
 */
export function useBarRefresh(
  sessionId: string | undefined,
  field: DetailBarField,
  label: string,
): { isRefreshing: boolean; refresh: () => Promise<void> } {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId || isRefreshing) return;
    setIsRefreshing(true);

    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/detail.bar?field=${field}&refresh=1`,
      );
      if (!res.ok) throw new Error(`bar refresh ${res.status}`);

      const page = (await res.json()) as {
        items?: unknown[];
        nextCursor?: string | null;
      };
      if (Array.isArray(page.items)) {
        useDetailBarStore
          .getState()
          .replacePage(field, null, page.items, page.nextCursor ?? null);
      }
      toast.success(`${label} refreshed`);
    } catch (err) {
      console.error(`Failed to refresh ${field}:`, err);
      toast.error(`Failed to refresh ${label.toLowerCase()}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [sessionId, field, label, isRefreshing]);

  return { isRefreshing, refresh };
}
