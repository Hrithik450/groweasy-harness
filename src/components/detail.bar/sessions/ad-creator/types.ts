import type {
  AdCreatorDetailBarData,
  DetailBarTabProps,
} from "@/lib/detail.bar/types";

import { DETAIL_BAR_TABS } from "@/lib/detail.bar/fields";

export type AdCreatorTabKey = keyof typeof DETAIL_BAR_TABS.adCreator;

export type AdCreatorTabProps = Partial<DetailBarTabProps<AdCreatorDetailBarData>>;
