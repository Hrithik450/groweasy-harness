"use client";

/**
 * Generative-UI seam.
 *
 * The Ad Manager alert cards render the diagnostic chart attached to an alert
 * with the application's full generative-UI renderer. That renderer depends on
 * the app's `@json-render` catalog and media viewers, so it cannot move into
 * this package. Instead the host installs it once through
 * {@link setDetailBarGenerativeUIRenderer}; the package keeps the exact call
 * site and props.
 *
 * The app-side registry shim installs the real renderer at import time, so
 * existing app imports keep the previous behavior. A host that boots this
 * package directly through Cordis can call the setter during boot.
 */
import type { ComponentType } from "react";

export interface DetailBarGenerativeUIRendererProps {
  spec: any;
  scopeId: string;
  onActionComplete?: (
    actionState: Record<string, unknown>,
  ) => Promise<void> | void;
  onValueChange?: (fieldId: string, value: unknown) => void;
  isStreaming?: boolean;
}

export type DetailBarGenerativeUIRenderer =
  ComponentType<DetailBarGenerativeUIRendererProps>;

let installed: DetailBarGenerativeUIRenderer | null = null;

/** Install the host's generative-UI renderer. */
export function setDetailBarGenerativeUIRenderer(
  renderer: DetailBarGenerativeUIRenderer | null,
): void {
  installed = renderer;
}

/** The installed renderer, or `null` before a host installs one. */
export function getDetailBarGenerativeUIRenderer(): DetailBarGenerativeUIRenderer | null {
  return installed;
}

/** Render the installed renderer, or nothing when the host installed none. */
export function DetailBarGenerativeUI(
  props: DetailBarGenerativeUIRendererProps,
) {
  const Renderer = installed;
  return Renderer === null ? null : <Renderer {...props} />;
}
