import { BAR_TABS } from "@/lib/detail.bar/fields";

export type AdStrategistTabKey = keyof typeof BAR_TABS.adStrategist;

export interface AdStrategistTabProps {
  session?: { id: string; title?: string } | null;
  data?: unknown;
}
