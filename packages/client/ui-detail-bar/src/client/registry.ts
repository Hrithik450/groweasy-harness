"use client";

/**
 * Detail-bar component registry.
 *
 * The key set is the session vocabulary (`SESSION_SLUGS`) plus `default`; the
 * data map in `../types` is declared against the same keys so a component and
 * its data type cannot drift apart.
 */
import type React from "react";
import type { SessionSlug } from "../constants";
import type {
  DetailBarComponentProps,
  DetailBarRegistry,
} from "../types";
import { DefaultDetailBar } from "./sessions/default";
import { AdManagerDetailBar } from "./sessions/ad-manager";
import { AdCreatorDetailBar } from "./sessions/ad-creator";
import { AdStrategistDetailBar } from "./sessions/ad-strategist";

export const DETAIL_BAR_REGISTRY: DetailBarRegistry & {
  [key: string]: React.ComponentType<DetailBarComponentProps<any>>;
} = {
  adManager: AdManagerDetailBar,
  adCreator: AdCreatorDetailBar,
  adStrategist: AdStrategistDetailBar,
  businessProfile: DefaultDetailBar,
  default: DefaultDetailBar,
};

/**
 * Resolve a detail-bar component by session slug or type string.
 * @param detailBarType - a registered slug, or any extra type string.
 * @returns the registered component, falling back to the default bar.
 */
export function getDetailBarComponent(
  detailBarType: SessionSlug | "default" | string,
): React.ComponentType<DetailBarComponentProps<any>> {
  return (
    DETAIL_BAR_REGISTRY[detailBarType as SessionSlug] ?? DefaultDetailBar
  );
}

