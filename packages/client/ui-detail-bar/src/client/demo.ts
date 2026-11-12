import type {
  AdCreatorCreative,
  AdCreatorIdea,
  CampaignAd,
} from "../types";

/**
 * Front-end-only demo data for the detail bar.
 *
 * These records are ONLY used as a fallback when the corresponding session list
 * is empty. They are never written back to the session or sent to the API.
 */

const DIWALI_ADS: CampaignAd[] = [
  {
    id: "diwali-ugc-unboxing",
    name: "UGC_unboxing_v3",
    classification: "winner",
    format: "video",
    thumbnailLabel: "VID",
    metricLines: [
      "CPA ₹298 vs ₹690 for your other ads here",
      "41% of the campaign's purchases · day 9",
    ],
    insight: "Outrunning every sibling ad in its ad set.",
    actionLabel: "Multiply variants",
    secondaryAction: {
      label: "For other products",
      prompt:
        "Adapt the winning UGC_unboxing_v3 ad for other products in the Diwali gift box campaign.",
    },
    whyItWorks:
      "Direct price-to-freshness contrast hook drives 41% of the campaign's purchases at 57% lower CPA than sibling ads.",
    action: {
      fix: "Multiply variants: 4 new directions (Sesame oil, Mustard oil, 9:16 Reel, vernacular hook)",
      before: "Single video variant taking 68% of ad set delivery · Frequency 2.8",
      after:
        "Stage 4 new variants in parallel test ad set · Retain original winner untouched",
      moneyValue: "Preserves ≈ ₹38,000/mo volume",
    },
  },
  {
    id: "diwali-price-reveal",
    name: "price_reveal_v2",
    classification: "scaler",
    format: "static",
    thumbnailLabel: "IMG",
    metricLines: [
      "ROAS 3.8 vs 3.1 campaign",
      "Spending 96% of its budget · frequency 1.6",
    ],
    insight: "Frequency 1.6 — the audience still has room.",
    actionLabel: "Increase budget: +₹600/day",
    savings: "+≈ 9 purchases/week",
    whyItWorks:
      "High headroom: consuming 96% of its daily budget at 3.8 ROAS while frequency stays at 1.6.",
    action: {
      fix: "Increase budget: +20% (+₹600/day)",
      before: "Daily budget ₹3,000/day · Frequency 1.6 · ₹312 CPA",
      after: "Daily budget ₹3,600/day · Expected 82 purchases/wk at target CPA",
      moneyValue: "Projected +9 purchases/wk (~₹19,800 rev)",
    },
  },
  {
    id: "diwali-static-shelf",
    name: "static_shelf_v1",
    classification: "loser",
    format: "static",
    thumbnailLabel: "IMG",
    metricLines: ["₹2,100 spent, 0 purchases", "Fair share of impressions ✓"],
    insight: "Fair share of impressions, zero purchases.",
    actionLabel: "Stop ad · move ₹400/day to UGC_unboxing_v3",
    savings: "saves ≈ ₹2,800/week",
    whyItWorks:
      "Received fair share of ad set impressions but produced 0 purchases across ₹2,100 spend.",
    action: {
      fix: "Stop ad and move budget to UGC_unboxing_v3",
      before: "Active ad draining ₹400/day with 0 conversions",
      after:
        "Ad status PAUSED · Ad set budget concentrated on winning UGC variant",
      moneyValue: "Saves ≈ ₹2,800/wk",
    },
  },
  {
    id: "diwali-lastchance",
    name: "lastchance_9x16",
    classification: "loser",
    format: "video",
    thumbnailLabel: "VID",
    metricLines: [
      "CPA ₹1,380, 2.0× your other ads here",
      "6 purchases · CTR fine, buyers drop on the page",
    ],
    insight: "CTR is fine; buyers drop on the landing page.",
    actionLabel: "Stop ad",
    secondaryAction: { label: "Optimise copy" },
    savings: "saves ≈ ₹1,900/week",
    whyItWorks:
      "Six purchases at more than double the sibling CPA. The hook works but the landing page loses buyers.",
    action: {
      fix: "Stop ad or optimise the landing copy before spending more",
      before: "CPA ₹1,380 · 2.0× sibling ads · ₹250/day",
      after: "Paused or refreshed copy staged for review",
      moneyValue: "Saves ≈ ₹1,900/wk",
    },
  },
  {
    id: "diwali-founder",
    name: "founder_30s",
    classification: "potential",
    format: "video",
    thumbnailLabel: "VID",
    metricLines: [
      "Day 3 · 38% of impressions · CTR 1.6× others",
      "Potential winner · budget protected",
    ],
    insight: "Early breakout; budget protected while it proves out.",
    whyItWorks:
      "Early breakout taking 38% impression share within 72 hours. Hook view rate is 2.4× the sibling baseline.",
    action: {
      fix: "Protected creative",
      moneyValue: "Protected while proving out (Day 3 of 7)",
    },
  },
  {
    id: "diwali-offer-emi",
    name: "offer_emi_v1",
    classification: "potential",
    format: "static",
    thumbnailLabel: "IMG",
    metricLines: [
      "4% of impressions · CTR 1.4× others",
      "Not a loser: Meta hasn't shown it enough",
    ],
    insight: "Meta hasn't shown it enough to judge yet.",
    actionLabel: "Give it a test budget: ₹300/day",
    whyItWorks:
      "Strong CTR on a small impression sample — needs its own test budget before a verdict.",
  },
];

/** Fallback for an individual campaign that has no ads attached yet. */
export const DEMO_CAMPAIGN_ADS: CampaignAd[] = DIWALI_ADS;

export const DEMO_AD_CREATOR_IDEAS: AdCreatorIdea[] = [
  {
    id: "idea-freshness",
    category: "FRESHNESS",
    title: "From our mill to your kadai in 48 hours",
    description: "Show press date on the bottle. Works for static and B-roll.",
  },
  {
    id: "idea-tradition",
    category: "TRADITION",
    title: "Pressed slow, the way your ajji did it",
    description: "Wooden ghani close-ups. Best as talking-head UGC.",
  },
  {
    id: "idea-proof",
    category: "PROOF",
    title: "The fridge test",
    description:
      "Answers the top buyer question from research: “is it really pure?”",
  },
];

export const DEMO_AD_CREATOR_CREATIVES: AdCreatorCreative[] = [
  {
    id: "creative-mill-to-kadai",
    title: "Mill to kadai · 1:1",
    type: "image",
    status: "Draft",
    aspectRatio: "1:1",
    description: "Press-date static with the bottle label in focus.",
    previewKind: "ink",
    statusLine: "Draft · today",
  },
  {
    id: "creative-ajji-ghani",
    title: "Ajji's ghani · 1:1",
    type: "image",
    status: "Draft",
    aspectRatio: "1:1",
    description: "Wooden ghani close-up static.",
    previewKind: "accent",
    statusLine: "Draft · today",
  },
  {
    id: "creative-talking-head",
    title: "Talking-head UGC · 9:16",
    type: "video",
    status: "Ready",
    aspectRatio: "9:16",
    description: "Founder talking-head video with press-date proof.",
    previewKind: "ink",
    duration: "0:24",
    campaign: "Groundnut oil",
    statusLine: "Live · Groundnut oil · Mysuru",
    isLive: true,
  },
  {
    id: "creative-diwali-combo",
    title: "Diwali combo box · 1:1",
    type: "image",
    status: "Ready",
    aspectRatio: "1:1",
    description: "Festive gifting combo static.",
    previewKind: "tan",
    statusLine: "Live · Diwali gifting",
    isLive: true,
  },
];
