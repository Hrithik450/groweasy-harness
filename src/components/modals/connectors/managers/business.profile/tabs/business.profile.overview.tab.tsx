"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import { markdownComponents } from "@/components/utils";
import type { BusinessProfileConnectorSchema } from "@/lib/connectors/business.profile";

interface BusinessProfileOverviewTabProps {
  data: BusinessProfileConnectorSchema;
}

export function BusinessProfileOverviewTab({
  data,
}: BusinessProfileOverviewTabProps) {
  const { brand, url } = data;

  if (!brand) {
    return (
      <div className="bg-linen border border-border/80 rounded-2xl p-8 text-center text-xs text-muted-foreground shadow-2xs">
        No brand profile yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Brand Header Card */}
      <div className="bg-linen/70 border border-border/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3.5 min-w-0">
          {brand.logoUrl ? (
            <div className="w-12 h-12 rounded-xl border border-border bg-card p-1.5 shrink-0 flex items-center justify-center shadow-2xs overflow-hidden">
              <img
                src={brand.logoUrl}
                alt={brand.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-xl border border-border bg-card flex items-center justify-center text-muted-2 shrink-0 shadow-2xs">
              <ImageIcon className="w-5 h-5" />
            </div>
          )}

          <div className="min-w-0">
            <h3 className="text-base font-bold text-foreground truncate">
              {brand.name || "Brand Name"}
            </h3>
            {url && (
              <span
                
                
                
                className="text-xs text-forest hover:underline inline-flex items-center gap-1 font-medium mt-0.5"
              >
                <span>{url.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Brand Description */}
      {brand.description && (
        <div className="bg-card border border-border/80 rounded-2xl p-4 sm:p-5 space-y-1.5 shadow-2xs">
          <span className="text-xs font-semibold text-muted-2 uppercase font-mono tracking-wider">
            About the Business
          </span>
          <p className="text-[13.5px] text-foreground leading-relaxed">
            {brand.description}
          </p>
        </div>
      )}

      {/* Curated Overview Markdown Section */}
      <div className="bg-card border border-border/80 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border-subtle">
          <div className="flex items-center gap-2 shrink-0">
            <FileText className="w-4 h-4 text-forest" />
            <h4 className="text-xs font-bold text-foreground tracking-tight uppercase">
              Brand Voice &amp; Overview
            </h4>
          </div>
          <span className="min-w-0 truncate text-[11px] text-muted-2">
            Representative copy &amp; value proposition
          </span>
        </div>

        {brand.overview ? (
          <div className="prose prose-sm max-w-none text-foreground leading-relaxed pt-1">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {brand.overview}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-xs text-muted-2 italic py-4 text-center">
            No overview snippet extracted yet.
          </div>
        )}
      </div>
    </div>
  );
}
