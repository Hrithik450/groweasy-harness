"use client";

import React from "react";
import type { DetailBarField } from "@/lib/detail.bar/fields";
import type { DetailBarType } from "@/lib/detail.bar/types";
import { DefaultDetailBar } from "./sessions/default";
import { AdManagerDetailBar } from "./sessions/ad-manager";
import { AdCreatorDetailBar } from "./sessions/ad-creator";
import { AdStrategistDetailBar } from "./sessions/ad-strategist";

export interface DetailBarNavigationOptions {
  /** Item creation time, used to resolve legacy non-anchor turn ids. */
  createdAt?: string;
  /** Chat that produced the item, when it differs from the bar's session. */
  sourceSessionId?: string;
}

export interface DetailBarComponentProps<TData = unknown> {
  /** Only carried so the bar's card types can be inferred; never rendered. */
  data?: TData;
  session?: import("@/lib/core/session/view").SessionView;
  isStreaming?: boolean;
  handleSubmit?: (
    content: string,
    options?: { source?: import("@/lib/session/prompt").PromptSource },
  ) => Promise<void> | void;
  handleUpdateData?: (item: {
    kind: DetailBarField;
    id: string;
    patch: Record<string, unknown>;
  }) => Promise<void>;
  handleNavigation?: (
    turnId: string,
    options?: DetailBarNavigationOptions,
  ) => void;
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
