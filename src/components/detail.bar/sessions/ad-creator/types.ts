import type {
  AdCreatorDetailBarData,
  DetailBarTabProps,
} from "@/lib/detail.bar/types";

import { BAR_TABS } from "@/lib/detail.bar/fields";

export type AdCreatorTabKey = keyof typeof BAR_TABS.adCreator;

export type AdCreatorTabProps = Partial<DetailBarTabProps<AdCreatorDetailBarData>>;
