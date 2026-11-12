"use client";

import { useEffect, useState } from "react";
import { BotDollAvatar } from "@openai-harness/client-ui-chat/client";

export const BUSINESS_PROFILE_LOADING_MESSAGES: string[] = [
  "Connecting to your website and mapping site architecture...",
  "Did you know? Consistent brand colors can increase brand recognition by up to 80%.",
  "Inspecting visual elements, contrast ratios, and design tokens...",
  "Did you know? Websites with clear value propositions convert 2.4x more visitors.",
  "Extracting primary color palette, secondary tones, and font classifications...",
  "Did you know? 73% of consumers cite customer experience as a deciding factor in buying.",
  "Discovering core product offerings and flagship value hooks...",
  "Did you know? Video ads on Meta achieve 48% higher engagement than static images.",
  "Synthesizing brand voice, editorial tone, and customer promise...",
  "Did you know? First impressions of a website are 94% design-related.",
  "Scanning Meta Ad Library for active competitor campaigns...",
  "Did you know? Top-performing direct-to-consumer brands test 10+ ad creatives weekly.",
  "Identifying direct market competitors in your target niche...",
  "Did you know? Localized ad copy can boost click-through rates by up to 42%.",
  "Analyzing competitor messaging angles, hooks, and calls-to-action...",
  "Did you know? Highlighting customer reviews in ads can lift conversions by 270%.",
  "Determining primary operating geography and regional fulfillment...",
  "Did you know? 68% of consumers say brand authenticity influences their purchasing decisions.",
  "Uncovering market differentiation opportunities against established rivals...",
  "Did you know? High-contrast CTA buttons can increase lead submissions by 35%.",
  "Mapping product positioning across competitive pricing and audience tiers...",
  "Did you know? Retargeting ads yield a 76% higher click rate than standard display ads.",
  "Evaluating social proof, trust badges, and verified customer testimonials...",
  "Did you know? Emotional advertising campaigns generate twice the profit of purely rational ones.",
  "Synthesizing proven competitor creative formats across Instagram and Facebook...",
  "Did you know? Ads tailored to regional language preferences drive 3x higher retention.",
  "Drafting strategic marketing conclusion and core customer benefit summary...",
  "Did you know? Stories and Reel ads drive 35% higher recall for lifestyle brands.",
  "Refining design system tokens and typography specifications...",
  "Did you know? Aligning your ad creative with the landing page design cuts bounce rates in half.",
  "Structuring comprehensive competitive intelligence report...",
  "Finalizing your structured Business Profile knowledge base...",
];

export function BusinessProfileAnalysisLoader() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setMessageIndex(
          (prev) => (prev + 1) % BUSINESS_PROFILE_LOADING_MESSAGES.length,
        );
        setFade(true);
      }, 250);
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center p-6 sm:p-8 text-center bg-card overflow-y-auto no-scrollbar animate-in fade-in duration-300 pb-16 sm:pb-20">
      {/* Plain Ball Loader */}
      <div className="mb-4 sm:mb-5">
        <BotDollAvatar size={64} withShadow={true} interactive={true} />
      </div>

      {/* Main Announcement & Rotating Subtitle */}
      <div className="max-w-lg sm:max-w-xl mx-auto flex flex-col items-center px-4">
        <h4 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
          Hold on, this deep scan may take up to 3 minutes
        </h4>
        <div className="min-h-[56px] mt-2 flex items-start justify-center">
          <p
            className={`text-base sm:text-[18px] text-muted-foreground leading-relaxed transition-all duration-250 ease-in-out ${
              fade
                ? "opacity-100 transform translate-y-0"
                : "opacity-0 transform -translate-y-1"
            }`}
          >
            {BUSINESS_PROFILE_LOADING_MESSAGES[messageIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
