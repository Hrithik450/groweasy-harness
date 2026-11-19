import { BAR_TABS } from "@/lib/detail.bar/fields";

export type AdManagerTabKey = keyof typeof BAR_TABS.adManager;

export interface AdManagerTabProps {
  session?: { id: string; title?: string } | null;
  data?: unknown;
}
