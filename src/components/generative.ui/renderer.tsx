"use client";

import React, { Component, createContext, type ReactNode } from "react";
import { Renderer, JSONUIProvider, ActionProvider } from "@json-render/react";
import { registry } from "./registry";
import { useInteractiveStore } from "@/store";

export interface GenerativeUIContextValue {
  scopeId?: string;
  isStreaming?: boolean;
  isSubmitted?: boolean;
  specValues?: Record<string, unknown>;
  setFieldValue?: (fieldId: string, value: unknown) => void;
}

export const GenerativeUIContext = createContext<GenerativeUIContextValue>({
  scopeId: "default",
  isSubmitted: false,
});

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class GenerativeUIErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn("[GenerativeUI] Error rendering spec:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-3 my-2 text-xs text-warning bg-warning-tint border border-warning-border rounded-lg">
            Could not able generate the response, please try again or contact
            support if the issue persists.
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export interface GenerativeUIRendererProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any;
  scopeId: string;
  onActionComplete?: (
    actionState: Record<string, unknown>,
  ) => Promise<void> | void;
  /**
   * Called on every interaction so the owning message can be updated directly
   * (no separate interactive store).
   */
  onValueChange?: (fieldId: string, value: unknown) => void;
  isStreaming?: boolean;
}

export function GenerativeUIRenderer({
  spec,
  scopeId,
  onActionComplete,
  onValueChange,
  isStreaming,
}: GenerativeUIRendererProps) {
  const localValuesRef = React.useRef<Record<string, unknown>>({});

  const prevScopeRef = React.useRef(scopeId);
  if (prevScopeRef.current !== scopeId) {
    prevScopeRef.current = scopeId;
    localValuesRef.current = {};
  }

  const setFieldValue = React.useCallback(
    (fieldId: string, value: unknown) => {
      localValuesRef.current[fieldId] = value;
      onValueChange?.(fieldId, value);
    },
    [onValueChange],
  );

  if (!spec?.root || !spec?.elements) return null;

  const isSubmitted = Boolean(spec?.submitted);
  const specValues =
    spec?.values && typeof spec.values === "object"
      ? (spec.values as Record<string, unknown>)
      : undefined;

  return (
    <GenerativeUIErrorBoundary>
      <GenerativeUIContext.Provider
        value={{ scopeId, isStreaming, isSubmitted, specValues, setFieldValue }}
      >
        <JSONUIProvider registry={registry}>
          <ActionProvider
            key={scopeId}
            handlers={{
              submit: async (data?: unknown) => {
                const params = (data as Record<string, unknown>) || {};
                // Interactive components write to the shared store, keyed by
                // this scope; the draft ref only sees components that report
                // through the context. Both are needed.
                const values = {
                  ...useInteractiveStore.getState().getAllValues(scopeId),
                  ...(specValues ?? {}),
                  ...localValuesRef.current,
                  ...(params.values
                    ? (params.values as Record<string, unknown>)
                    : {}),
                };
                await onActionComplete?.({
                  ...params,
                  scopeId,
                  values,
                  _source: "interactive",
                });
              },
            }}
          >
            <Renderer spec={spec} registry={registry} />
          </ActionProvider>
        </JSONUIProvider>
      </GenerativeUIContext.Provider>
    </GenerativeUIErrorBoundary>
  );
}
