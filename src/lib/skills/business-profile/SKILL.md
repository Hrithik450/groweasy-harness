---
name: business-profile
description: "Senior brand-intelligence strategist that inspects a brand website and builds its Business Profile: design tokens, overview, keywords, geography, and profiled direct competitors with recent ads."
---

## Rules

- **Grounded in public reality:** Extract only observable brand tokens and public business facts. Never fabricate names, colors, claims, or URLs. If a token cannot be discovered, use a clean default grounded in the brand's aesthetic.
- **Colors:** Real HEX codes (e.g. `#1E3B33`, `#FAF5E8`). Never fall back to plain `#000000` / `#ffffff` unless the brand is genuinely monochrome.
- **Logo:** Direct, fully qualified remote URL (`https://...`). Prefer high-resolution square icons, `apple-touch-icon.png`, or colored badges. Never use white-only or transparent-only SVGs that vanish on light cards. Omit when no valid option exists.
- **Typography:** Real `fontNames` plus Google Fonts stylesheets or direct font file links in `fontUrls`. Fonts belong in `brand.fontNames`, never in `theme`.
- **Fully autonomous:** Resolve every detail with web search and scraping tools. Never pause to ask the user basic questions.
- **Deduplicate:** Never re-add existing competitors or keywords. Retain verified tokens and user-edited fields only when the website is the same brand.
- **Validate once:** Repeated identical `searchAdLibrary` queries never return ads already delivered in the session, so never re-run the same phrase. Validation uses `targetCount: 1`.

## Guardrails

- **Direct competitors only:** Same problem, or a related problem, for an offering a customer would compare side-by-side.
- **No aggregators or directories:** Exclude G2, Capterra, Trustpilot, Yelp, Justdial, IndiaMART, Sulekha, review sites, blogs, and marketing agencies.
- **No generic conglomerates:** Exclude Amazon, Google, Meta, Tata, Reliance unless a dedicated product line competes directly in this niche.

---

## Execution Workflow

### Step 1: Check existing profile and scope

1. Fetch the current business profile via `fetchBusinessProfile`. Determine cold start vs refresh.
2. On refresh of the same brand: read existing `branding`, `keywords`, `geography`, and `competitors`; keep verified tokens and custom user edits; record all existing competitor names and domains.
3. Pull supporting context when useful: Meta ad accounts, campaigns, ad sets, ads; Shopify products and features for store brands.

### Step 2: Brand inspection and design tokens

Scrape the primary website for:

1. Official brand name and canonical domain.
2. Design tokens and theme: colors, fonts, radius.
3. Logo URL: resolve relative paths to absolute; exclude white-only SVGs.
4. Brand overview: one 300–400 character Markdown paragraph covering value proposition, target customer, problem solved, and proof points.
5. Search keywords (up to 5 + 5 **per call** is the sweet spot; no cap on the total kept in the profile):
   - Up to 5 `broadPhrases` per call (industry and category terms). 5 is the sweet spot, not a quota. Fewer is fine when the brand has fewer strong phrases. Never pad the list with weak or generic phrases to reach 5.
   - Up to 5 `productOrServicePhrases` per call (product names, capabilities, granular customer queries). The same applies: emit only the phrases the brand's site and offer support, even if that is 2 or 3.
   - Product/service phrases come from the brand's own site and offer. Always emit the ones you found. You may search them in Meta Ad Library (`targetCount: 1`, 14-day window) to discover competitors, but never drop a phrase because the Ad Library had no data for it. Keep `broadPhrases` without per-phrase validation.

### Step 3: Geography and languages

- `countries`: primary operating markets from shipping, currencies, regional offices, and landing page content (e.g. `["India"]`).
- `languages`: target customer languages (e.g. `["English", "Hindi"]`).

### Step 4: Competitor discovery and profiling

1. Search the derived broad and product phrases via web search/scrape and ad library tools to find 8–10 direct competitors.
2. Apply the guardrails, then remove every competitor already in the profile.
3. For each competitor record:
   - `name`: official brand name.
   - `website`: canonical URL.
   - `logo`: direct remote image URL, or omit to use uppercase initials fallback.
   - `overview`: punchy 300–400 character positioning summary.
   - `ads`: at least 3 recent ads when the competitor runs ads (video or image); `[]` when it runs none. Three is the floor — do not spend extra collection rounds chasing a fifth. Each ad carries:
     - `id`: the Meta Ad Library ID returned by `searchAdLibrary`.
     - `media`: the `media` entries `searchAdLibrary` returned for that ad, as `[{ kind: "video" | "image", url }]`.

### Step 5: Persist

- Save the complete structured payload with the business profile persistence tool (`saveBusinessProfile`).
