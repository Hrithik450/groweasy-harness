"use client";

import { ExternalLink } from "lucide-react";

export function MetaConnectHero() {
  const handleLogin = () => {
    const current =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/c";
    window.location.href = `/api/auth/meta/login?returnTo=${encodeURIComponent(current)}`;
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3.5">
      <div className="w-12 h-12 bg-card border border-border rounded-none flex items-center justify-center mx-auto p-1.5 overflow-hidden">
        <img
          src="/images/connectors/meta.svg"
          alt="Meta"
          className="w-full h-full object-contain aspect-square"
        />
      </div>

      <div className="space-y-1">
        <h4 className="text-sm sm:text-base font-semibold text-foreground tracking-tight">
          Connect Meta Ads Manager
        </h4>
        <p className="text-xs sm:text-[13px] text-muted-foreground max-w-md mx-auto leading-relaxed">
          Authorize your Meta account to allow the AI Agent to create, launch,
          and manage campaigns and read live advertising insights.
        </p>
      </div>

      <div className="pt-0.5">
        <button
          type="button"
          onClick={handleLogin}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-none bg-provider-meta-blue hover:bg-provider-meta-blue-dark text-primary-foreground text-xs font-semibold transition-all cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Log in with Meta</span>
        </button>
      </div>
    </div>
  );
}
