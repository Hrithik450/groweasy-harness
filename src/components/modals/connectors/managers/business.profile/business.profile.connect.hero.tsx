"use client";

import React, { useState } from "react";
import { Globe, Loader2, AlertCircle } from "lucide-react";
import { BusinessProfileAnalysisLoader } from "./business.profile.loader";

interface BusinessProfileConnectHeroProps {
  onConnect: (url: string) => Promise<void> | void;
  isLoading?: boolean;
  statusMessage?: string;
  initialUrl?: string;
}

export function BusinessProfileConnectHero({
  onConnect,
  isLoading = false,
  statusMessage,
  initialUrl = "",
}: BusinessProfileConnectHeroProps) {
  const [url, setUrl] = useState(initialUrl);
  const [prevInitialUrl, setPrevInitialUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);

  if (initialUrl !== prevInitialUrl) {
    setPrevInitialUrl(initialUrl);
    if (!url) {
      setUrl(initialUrl);
    }
  }

  if (isLoading) {
    return <BusinessProfileAnalysisLoader />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter your website URL");
      return;
    }

    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    try {
      const parsed = new URL(normalized);
      if (!parsed.hostname || !parsed.hostname.includes(".")) {
        setError("Please enter a valid domain (e.g. brand.com)");
        return;
      }
    } catch {
      setError("Please enter a valid URL (e.g. https://yourbrand.com)");
      return;
    }

    setError(null);
    onConnect(normalized);
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center p-6 sm:p-8 text-center space-y-5 bg-card overflow-y-auto no-scrollbar">
      {/* Connector Icon */}
      <div className="w-12 h-12 bg-card border border-border rounded-none flex items-center justify-center mx-auto p-1.5 overflow-hidden">
        <img
          src="/images/connectors/business-profile.svg"
          alt="Brand Brain"
          className="w-full h-full object-contain aspect-square"
        />
      </div>

      {/* Title & Description */}
      <div className="space-y-1 max-w-md mx-auto">
        <h4 className="text-sm sm:text-base font-semibold text-foreground tracking-tight">
          Connect Brand Brain
        </h4>
        <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
          Enter your brand&apos;s website URL. We will analyze your website to
          extract your brand identity, operating geography, and key competitors.
        </p>
      </div>

      {/* Intake Form */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-auto space-y-3 pt-1"
      >
        <div className="relative">
          <Globe className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={url}
            disabled={isLoading}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. groweasy.ai or https://yourbrand.com"
            className="w-full bg-card border border-border rounded-none pl-10 pr-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-destructive text-left px-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-none bg-brand hover:bg-brand-hover text-primary-foreground text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{statusMessage || "Analyzing website deeply..."}</span>
            </>
          ) : (
            <span>Connect &amp; Analyze</span>
          )}
        </button>

        {isLoading && (
          <p className="text-[11.5px] text-muted-foreground animate-pulse pt-1">
            This deep scan usually takes 10–25 seconds. Please hold on...
          </p>
        )}
      </form>
    </div>
  );
}
