"use client";

import React from "react";
import { AlertCircle, RotateCw, ArrowLeft } from "lucide-react";

interface BusinessProfileRetryViewProps {
  url: string;
  error?: string | null;
  onRetry: () => void;
  onChangeUrl: () => void;
}

export function BusinessProfileRetryView({
  url,
  error,
  onRetry,
  onChangeUrl,
}: BusinessProfileRetryViewProps) {
  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center p-6 sm:p-8 text-center bg-card overflow-y-auto no-scrollbar animate-in fade-in duration-200 pb-12 sm:pb-16">
      {/* Error Badge Icon */}
      <div className="w-12 h-12 bg-destructive-tint border border-destructive/25 rounded-none flex items-center justify-center mx-auto text-destructive mb-3.5">
        <AlertCircle className="w-6 h-6" />
      </div>

      {/* Title & Target URL */}
      <div className="space-y-1.5 max-w-md mx-auto mb-4">
        <h4 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
          Analysis Couldn&apos;t Complete
        </h4>
        <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
          We encountered an issue while analyzing{" "}
          <span className="font-medium text-foreground break-all">{url}</span>.
        </p>
      </div>

      {/* Error Message Box */}
      {error && (
        <div className="w-full max-w-md mx-auto mb-6 bg-destructive-tint border border-destructive/25 rounded-none px-4 py-2.5 text-xs text-destructive text-center leading-relaxed">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="w-full max-w-xs mx-auto flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onRetry}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-none bg-brand hover:bg-brand-hover text-primary-foreground text-xs font-semibold transition-all cursor-pointer active:scale-98"
        >
          <RotateCw className="w-3.5 h-3.5 shrink-0" />
          <span>Retry Analysis</span>
        </button>

        <button
          type="button"
          onClick={onChangeUrl}
          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Change website URL</span>
        </button>
      </div>
    </div>
  );
}
