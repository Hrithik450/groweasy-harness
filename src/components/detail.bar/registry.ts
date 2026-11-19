"use client";

import React from "react";
import type { BarField } from "@/lib/detail.bar/fields";
import type { DetailBarType } from "@/lib/detail.bar/types";
import { DefaultDetailBar } from "./sessions/default";
import { AdManagerDetailBar } from "./sessions/ad-manager";
import { AdCreatorDetailBar } from "./sessions/ad-creator";
import { AdStrategistDetailBar } from "./sessions/ad-strategist";

export interface DetailBarComponentProps<TData = unknown> {
  detailBar: { type?: string; data: TData };
  session?: import("@/lib/core/session/view").SessionView;
  isStreaming?: boolean;
  handleSubmit?: (
    content: string,
    options?: { source?: import("@/lib/session/prompt").PromptSource },
  ) => Promise<void> | void;
  handleUpdateData?: (
    newData: Partial<TData>,
    item?: { kind: BarField; id: string; patch: Record<string, unknown> },
  ) => Promise<void>;
  handleNavigation?: (turnId: string) => void;
}

export const DETAIL_BAR_REGISTRY = {
  adManager: AdManagerDetailBar,
  adCreator: AdCreatorDetailBar,
  adStrategist: AdStrategistDetailBar,
  default: DefaultDetailBar,
};

export type DetailBarRegistry = typeof DETAIL_BAR_REGISTRY;

export function getDetailBarComponent(
  detailBarType: DetailBarType,
): React.ComponentType<DetailBarComponentProps<unknown>> {
  const component =
    DETAIL_BAR_REGISTRY[detailBarType as keyof DetailBarRegistry] ??
    DETAIL_BAR_REGISTRY.default;
  return component as React.ComponentType<DetailBarComponentProps<unknown>>;
}
