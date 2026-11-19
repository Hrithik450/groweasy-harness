import { DETAIL_BAR_TABS } from "@/lib/detail.bar/fields";

export type AdManagerTabKey = keyof typeof DETAIL_BAR_TABS.adManager;

export interface AdManagerTabProps {
  session?: { id: string; title?: string } | null;
  data?: unknown;
}
