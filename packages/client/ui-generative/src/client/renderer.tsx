"use client";

import React, { Component, createContext, type ReactNode } from "react";
import { Renderer, JSONUIProvider, ActionProvider } from "@json-render/react";
import { registry } from "./registry";

export interface GenerativeUIContextValue {
  scopeId?: string;
  isStreaming?: boolean;
  /**
   * The block no longer accepts input: it was submitted, or its turn became
   * history. Controls render disabled and the SubmitBar is gone.
   */
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
          <div className="p-3 my-2 text-xs text-warning bg-warning-tint border border-warning/30 rounded-none">
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
  /**
   * The block belongs to a turn the conversation has moved past. It renders
   * read-only — controls disabled and no SubmitBar — exactly like a block the
   * user already submitted, whether or not it was ever answered.
   */
  isLocked?: boolean;
}

export function GenerativeUIRenderer({
  spec,
  scopeId,
  onActionComplete,
  onValueChange,
  isStreaming,
  isLocked = false,
}: GenerativeUIRendererProps) {
  // Interaction values live in a ref *and* in state, on purpose. The ref is
  // what the submit handler reads: the action handlers are captured by the
  // json-render provider and can still close over the first render, so a
  // state-only read sends `values: {}` even though the UI shows a selection.
  // The state is what makes the selection visible in the first place.
  const localValuesRef = React.useRef<Record<string, unknown>>({});
  const [localValues, setLocalValues] = React.useState<
    Record<string, unknown>
  >({});

  // A different block is a different form; drop the previous selections.
  React.useEffect(() => {
    localValuesRef.current = {};
    setLocalValues({});
  }, [scopeId]);

  const setFieldValue = (fieldId: string, value: unknown) => {
    const next = { ...localValuesRef.current, [fieldId]: value };
    localValuesRef.current = next;
    setLocalValues(next);
    onValueChange?.(fieldId, value);
  };

  if (!spec?.root || !spec?.elements) return null;

  // A submitted block and a block from a past turn render the same way: the
  // answer is closed, so every control disables and the SubmitBar disappears.
  const isSubmitted = Boolean(spec?.submitted) || isLocked;
  const durableValues =
    spec?.values && typeof spec.values === "object"
      ? (spec.values as Record<string, unknown>)
      : {};
  // Durable values (a submitted block) win; live selections layer on top.
  const specValues = { ...durableValues, ...localValues };

  return (
    <GenerativeUIErrorBoundary>
      <GenerativeUIContext.Provider
        value={{
          scopeId,
          isStreaming,
          isSubmitted,
          specValues,
          setFieldValue,
        }}
      >
        <JSONUIProvider registry={registry}>
          <ActionProvider
            key={scopeId}
            handlers={{
              submit: async (data?: unknown) => {
                // A past turn is closed: no component — the SubmitBar or any
                // other action trigger — may send an answer from it.
                if (isLocked) return;
                const params = (data as Record<string, unknown>) || {};
                // Read the ref, not the render closure: handlers can be stale.
                const values = {
                  ...durableValues,
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
