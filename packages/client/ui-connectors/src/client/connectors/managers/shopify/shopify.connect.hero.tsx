"use client";

import { useState } from "react";
import { ExternalLink, ShoppingBag, Store } from "lucide-react";
import { connectorsUrl } from "../../../connectors.client";
import { currentReturnTo } from "../../../lib/utils";

export function ShopifyConnectHero() {
  const [shopInput, setShopInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConnect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = shopInput.trim();
    if (!trimmed) {
      setError("Please enter your Shopify store name or myshopify domain.");
      return;
    }

    setError(null);
    if (typeof window === "undefined") return;
    // Drop stale callback parameters so they cannot ride into this login.
    const current = currentReturnTo();

    // The OAuth hop runs on the gateway origin, which serves no app route: the
    // page's own origin travels with it so the callback returns here.
    const target = new URL(connectorsUrl("/api/auth/shopify/login"));
    target.searchParams.set("shop", trimmed);
    target.searchParams.set("returnTo", current);
    target.searchParams.set("returnOrigin", window.location.origin);
    window.location.href = target.toString();
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-lg mx-auto">
      {/* Icon */}
      <div className="w-14 h-14 bg-card border border-border rounded-none flex items-center justify-center mx-auto p-2 overflow-hidden">
        <img
          src="/images/connectors/shopify.svg"
          alt="Shopify"
          className="w-full h-full object-contain aspect-square"
        />
      </div>

      {/* Headings */}
      <div className="space-y-1.5">
        <h4 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
          Connect Shopify Store
        </h4>
        <p className="text-xs sm:text-[13px] text-muted-foreground max-w-md mx-auto leading-relaxed">
          Authorize your store to allow your AI Marketing Team to read your
          product catalog, stock levels, and advertising performance.
        </p>
      </div>

      {/* Store Domain Input Form */}
      <form
        onSubmit={handleConnect}
        className="w-full max-w-md space-y-3 pt-1 text-left"
      >
        <div>
          <label
            htmlFor="shopify-shop-input"
            className="block text-xs font-semibold text-foreground mb-1"
          >
            Store Domain or Name
          </label>
          <div className="relative flex items-center">
            <div className="absolute left-3 text-muted-foreground pointer-events-none">
              <Store className="w-4 h-4" />
            </div>
            <input
              id="shopify-shop-input"
              type="text"
              value={shopInput}
              onChange={(e) => {
                setShopInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. my-brand or my-brand.myshopify.com"
              className="w-full bg-card border border-border rounded-none pl-9 pr-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:ring-2 focus:ring-ring/10 transition-all"
            />
          </div>
          {error && (
            <p className="text-[11px] text-destructive mt-1.5 font-medium">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-none bg-brand hover:bg-brand-hover text-primary-foreground text-xs font-semibold transition-all cursor-pointer active:scale-98"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Connect with Shopify</span>
        </button>
      </form>
    </div>
  );
}
