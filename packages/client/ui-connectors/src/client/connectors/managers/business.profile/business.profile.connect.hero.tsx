"use client";

import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { BusinessProfileAnalysisLoader } from "./business.profile.loader";

interface BusinessProfileConnectHeroProps {
  onConnect: (url: string) => Promise<void> | void;
  isLoading?: boolean;
  initialUrl?: string;
}

export function BusinessProfileConnectHero({
  onConnect,
  isLoading = false,
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
    <div className="w-full flex-1 flex flex-col items-center justify-center p-6 sm:p-8 text-center space-y-4 bg-card overflow-y-auto no-scrollbar">
      {/* Connector Icon */}
      <div className="w-12 h-12 bg-card border border-border rounded-none flex items-center justify-center mx-auto p-1.5 overflow-hidden">
        <img
          src="/images/connectors/business-profile.svg"
          alt="Business Profile"
          className="w-full h-full object-contain aspect-square"
        />
      </div>

      {/* Title & Description */}
      <div className="space-y-1 max-w-md mx-auto">
        <h4 className="text-sm sm:text-base font-semibold text-foreground tracking-tight">
          Connect Business Profile
        </h4>
        <p className="text-xs sm:text-[13px] text-muted-foreground max-w-md mx-auto leading-relaxed">
          Enter your brand&apos;s website URL. We will analyze your website
          to extract your brand identity, operating geography, and key
          competitors.
        </p>
      </div>

      {/* Intake Form */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-auto space-y-3 pt-1"
      >
        <div>
          <input
            type="text"
            value={url}
            disabled={isLoading}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. groweasy.ai or https://yourbrand.com"
            className="w-full bg-card border border-border rounded-none px-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all disabled:bg-muted disabled:text-muted-foreground"
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
          disabled={!url.trim()}
          className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-none bg-brand hover:bg-brand-hover text-primary-foreground text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
        >
          Connect &amp; Analyze
        </button>
      </form>
    </div>
  );
}
