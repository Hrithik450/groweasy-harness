export const OVERLAY_TYPES_SLUG = [
  "social_proof_and_trust",
  "comparison_and_education",
  "product_and_feature_showcase",
  "native_and_social_mockups",
  "offers_and_conversion_urgency",
  "local_and_lead_generation",
] as const;

export type OverlayTypeSlug = (typeof OVERLAY_TYPES_SLUG)[number];

export interface OverlayCluster {
  slug: OverlayTypeSlug;
  name: string;
  description: string;
  examples: string;
}

export const overlayClusters: OverlayCluster[] = [
  {
    slug: "social_proof_and_trust",
    name: "Social Proof & Trust Builders",
    description:
      "Customer reviews, 5-star ratings, verified user counts, viral tweets, heroic single metrics, and authentic founder mission stories that eliminate buyer skepticism.",
    examples:
      "1) 5-star customer review card with verified buyer badge and glowing testimonial; 2) Giant 94% retention stat hero with trust pilot badges and social proof ticker.",
  },
  {
    slug: "comparison_and_education",
    name: "Comparison, Frameworks & Education",
    description:
      "Direct Us vs Them comparison matrices, Before vs After dual splits, Problem-Agitate-Solution cards, numbered listicles, step-by-step processes, and FAQ objection busters.",
    examples:
      "1) Us vs Them side-by-side feature matrix with green checks vs red crosses; 2) Problem-Agitate-Solution 3-card stack highlighting manual pain vs automated relief.",
  },
  {
    slug: "product_and_feature_showcase",
    name: "Product & Feature Showcases",
    description:
      "Packshot hero frames with value chips, anatomical ingredient callouts with leader lines, mobile app feature showcases, lifestyle in-use benefit pills, and full-bleed hero photo scrims.",
    examples:
      "1) Premium serum bottle packshot with 3 benefit chips and price pill; 2) Ingredient breakdown with leader lines connecting botanical active callouts to product bottle.",
  },
  {
    slug: "native_and_social_mockups",
    name: "Native Social & Conversational Mockups",
    description:
      "Native platform UI elements mimicking everyday mobile apps: WhatsApp / iMessage chat conversations, iOS Notes app checklists, Instagram story stickers, relatable reaction memes, and carousel swipe teasers.",
    examples:
      "1) WhatsApp chat mockup showing 1-minute lead inquiry and automated instant reply; 2) Apple Notes app mockup with a handwritten daily skin ritual checklist.",
  },
  {
    slug: "offers_and_conversion_urgency",
    name: "Offers, Urgency & Direct Response",
    description:
      "High-converting promotional levers: BOGO and percentage-off starburst badges, countdown timer boxes (DD:HH:MM:SS), multi-tier pricing cards with highlighted deals, giveaway contests, and new product launch ribbons.",
    examples:
      "1) Flat 30% OFF starburst badge with coupon code pill and urgent terms; 2) 3-column pricing tier card highlighting the 'Best Value' bundle with savings badge.",
  },
  {
    slug: "local_and_lead_generation",
    name: "Local Retail & Lead Generation",
    description:
      "Local storefront physical visit cards with maps and hours, free downloadable eBook/guide lead magnets with download CTAs, and festive greeting posters with blessings and contact info.",
    examples:
      "1) High-street retail store card with Google map pin, opening hours, and 'Get Directions' CTA; 2) Elegant Diwali festive greeting poster with glowing diya, blessing, and shop owner footer.",
  },
];

export interface OverlayTemplate {
  slug: string;
  prompt: string;
}

export const overlayTemplates: Record<OverlayTypeSlug, OverlayTemplate[]> = {
  social_proof_and_trust: [
    {
      slug: "08_testimonial_quote",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#2A140B"/>

  <!-- Top Header -->
  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#F2B544">Glowveda Reviews</text>

  <!-- White Floating Review Card -->
  <g transform="translate(72, 220)" filter="url(#card_shadow)">
    <rect width="936" height="850" rx="32" fill="#FFFFFF"/>

    <!-- Decorative Quotation Mark -->
    <text x="72" y="140" font-family="serif" font-weight="900" font-size="140" fill="#D9572B" opacity="0.3">“</text>

    <!-- 5 Gold Stars -->
    <g transform="translate(72, 160)">
      <text x="0" y="40" font-family="system-ui, sans-serif" font-size="46" fill="#F2B544">★★★★★</text>
    </g>

    <!-- Quote Body -->
    <text x="72" y="270" font-family="system-ui, sans-serif" font-weight="700" font-size="44" fill="#2A140B" line-height="1.3">
      <tspan x="72" dy="0">"My dark spots faded in about</tspan>
      <tspan x="72" dy="64">a month and my skin finally looks</tspan>
      <tspan x="72" dy="64">even. I've repurchased twice."</tspan>
    </text>

    <!-- Author Avatar & Name -->
    <g transform="translate(72, 540)">
      <circle cx="50" cy="50" r="50" fill="#D9572B"/>
      <text x="50" y="62" font-family="system-ui, sans-serif" font-weight="700" font-size="36" fill="#FFFFFF" text-anchor="middle">AR</text>

      <text x="130" y="45" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#2A140B">Ananya R., Pune</text>
      <text x="130" y="85" font-family="system-ui, sans-serif" font-weight="400" font-size="24" fill="#6B5249">Customer since 2025</text>
    </g>

    <!-- Verified Buyer Badge -->
    <g transform="translate(72, 700)">
      <rect width="240" height="50" rx="10" fill="#E6F4EA"/>
      <text x="120" y="34" font-family="system-ui, sans-serif" font-weight="700" font-size="22" fill="#137333" text-anchor="middle">✓ Verified Buyer</text>
    </g>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1160)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "09_rating_social_proof",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.06"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#D9572B">Loved across India</text>
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">Rated <tspan fill="#D9572B">4.8</tspan> by</text>
  <text x="72" y="260" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">12,000+ customers</text>

  <!-- Massive Stat Block -->
  <g transform="translate(72, 310)">
    <text x="0" y="140" font-family="system-ui, sans-serif" font-weight="900" font-size="160" fill="#2A140B">4.8</text>
    <text x="280" y="80" font-family="system-ui, sans-serif" font-size="64" fill="#F2B544">★★★★★</text>
    <text x="285" y="130" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#6B5249">12,431 verified customer reviews</text>
  </g>

  <!-- 3 Snippet Review Cards -->
  <g transform="translate(72, 530)">
    <g filter="url(#card_shadow)">
      <rect width="936" height="130" rx="18" fill="#FFFFFF"/>
      <text x="40" y="55" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#2A140B">"Absorbs fast and zero breakouts."</text>
      <text x="40" y="95" font-family="system-ui, sans-serif" font-weight="500" font-size="22" fill="#6B5249">— Riya M., Mumbai · ★★★★★</text>
    </g>

    <g transform="translate(0, 160)" filter="url(#card_shadow)">
      <rect width="936" height="130" rx="18" fill="#FFFFFF"/>
      <text x="40" y="55" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#2A140B">"Visible glow in 3 weeks, real results."</text>
      <text x="40" y="95" font-family="system-ui, sans-serif" font-weight="500" font-size="22" fill="#6B5249">— Megha S., Bangalore · ★★★★★</text>
    </g>

    <g transform="translate(0, 320)" filter="url(#card_shadow)">
      <rect width="936" height="130" rx="18" fill="#FFFFFF"/>
      <text x="40" y="55" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#2A140B">"Finally a serum that doesn't oxidise."</text>
      <text x="40" y="95" font-family="system-ui, sans-serif" font-weight="500" font-size="22" fill="#6B5249">— Sana K., Delhi · ★★★★★</text>
    </g>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "16_big_stat",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda Clinical Study</text>

  <!-- Huge 260px Stat Number -->
  <text x="72" y="440" font-family="system-ui, sans-serif" font-weight="900" font-size="260" fill="#D9572B">92%</text>

  <!-- Headline -->
  <text x="72" y="560" font-family="system-ui, sans-serif" font-weight="800" font-size="80" fill="#2A140B">saw <tspan fill="#D9572B">brighter skin</tspan></text>
  <text x="72" y="650" font-family="system-ui, sans-serif" font-weight="800" font-size="80" fill="#2A140B">in 28 days.</text>

  <!-- Explanation card -->
  <g transform="translate(72, 750)">
    <rect width="936" height="220" rx="20" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="2"/>
    <text x="40" y="60" font-family="system-ui, sans-serif" font-weight="700" font-size="32" fill="#2A140B">Independent Consumer Trial</text>
    <text x="40" y="115" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">Tested over 4 weeks across 240 Indian women</text>
    <text x="40" y="155" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">aged 22–45 with hyperpigmentation and sun spots.</text>
  </g>

  <!-- Source line -->
  <text x="540" y="1080" font-family="system-ui, sans-serif" font-weight="400" font-size="22" fill="#6B5249" text-anchor="middle">Based on 28-day dermatological evaluation protocol GLW-2025.</text>

  <!-- CTA -->
  <g transform="translate(360, 1160)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "17_founder_story",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#000" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#2A140B"/>

  <!-- Top Header & Headline -->
  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#F2B544">Behind Glowveda</text>
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#FFFFFF">Made in our <tspan fill="#F2B544">lab,</tspan></text>
  <text x="72" y="260" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#FFFFFF">not a factory.</text>

  <!-- Center Photo Area Placeholder -->
  <g transform="translate(72, 320)">
    <rect width="936" height="420" rx="24" fill="#3A1A0E" stroke="#6B5249" stroke-width="2"/>
    <text x="468" y="220" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFF5EE" opacity="0.6" text-anchor="middle">[Founder Lab / Workshop Photo]</text>
  </g>

  <!-- Quote Card -->
  <g transform="translate(72, 780)" filter="url(#card_shadow)">
    <rect width="936" height="320" rx="24" fill="#FFFFFF"/>
    <text x="50" y="70" font-family="serif" font-weight="900" font-size="80" fill="#D9572B" opacity="0.4">“</text>
    
    <text x="50" y="120" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#2A140B" line-height="1.4">
      <tspan x="50" dy="0">"I started Glowveda because I couldn't find a single</tspan>
      <tspan x="50" dy="48">Vitamin C serum that stayed active in Indian summers."</tspan>
    </text>

    <!-- Founder Name & Title -->
    <text x="50" y="240" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#D9572B">Dr. Priya Nair</text>
    <text x="50" y="275" font-family="system-ui, sans-serif" font-weight="500" font-size="22" fill="#6B5249">Cosmetic Formulator &amp; Founder</text>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Our Story →</text>
  </g>
</svg>`,
    },
    {
      slug: "21_tweet_social_card",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="tweet_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#F1F5F9"/>

  <!-- Centered White Tweet Card -->
  <g transform="translate(72, 280)" filter="url(#tweet_shadow)">
    <rect width="936" height="680" rx="32" fill="#FFFFFF"/>

    <!-- Avatar -->
    <circle cx="100" cy="110" r="48" fill="#D9572B"/>
    <text x="100" y="124" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#FFFFFF" text-anchor="middle">AK</text>

    <!-- Name & Handle -->
    <text x="170" y="98" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#0F172A">Ananya</text>
    <circle cx="310" cy="90" r="14" fill="#1D9BF0"/>
    <text x="310" y="96" font-family="system-ui, sans-serif" font-weight="800" font-size="16" fill="#FFFFFF" text-anchor="middle">✓</text>
    <text x="170" y="136" font-family="system-ui, sans-serif" font-weight="400" font-size="28" fill="#64748B">@ananya.skin</text>

    <!-- X Logo in top right -->
    <text x="860" y="110" font-family="system-ui, sans-serif" font-weight="900" font-size="38" fill="#0F172A">𝕏</text>

    <!-- Tweet Body Text -->
    <text x="60" y="250" font-family="system-ui, sans-serif" font-weight="500" font-size="44" fill="#0F172A">
      <tspan x="60" dy="0">unpopular opinion: you don't</tspan>
      <tspan x="60" dy="64">need 10 serums. one stable</tspan>
      <tspan x="60" dy="64">vitamin c + sunscreen did more</tspan>
      <tspan x="60" dy="64">for my skin than my whole shelf.</tspan>
    </text>

    <!-- Timestamp & Stats -->
    <line x1="60" y1="530" x2="876" y2="530" stroke="#F1F5F9" stroke-width="2"/>
    <text x="60" y="585" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#64748B">9:14 AM · Oct 24, 2026 · <tspan font-weight="700" fill="#0F172A">2.1K</tspan> Likes · <tspan font-weight="700" fill="#0F172A">312</tspan> Reposts</text>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1080)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "04_number_cards",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FAFBFF"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#196FFD">SkyNest AI</text>
  <text x="72" y="190" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#081028">Reply in <tspan fill="#196FFD">seconds,</tspan></text>
  <text x="72" y="275" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#081028">not hours.</text>
  <text x="72" y="345" font-family="system-ui, sans-serif" font-weight="400" font-size="34" fill="#465069">What top brokers see in their first 30 days:</text>

  <!-- 3 Big Cards -->
  <g transform="translate(72, 420)">
    <!-- Card 1 -->
    <g filter="url(#card_shadow)">
      <rect width="936" height="180" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
      <text x="60" y="115" font-family="system-ui, sans-serif" font-weight="800" font-size="84" fill="#196FFD">&lt;1 min</text>
      <text x="440" y="95" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#081028">First reply speed</text>
      <text x="440" y="135" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#64748B">Beats competitors to the prospect</text>
    </g>

    <!-- Card 2 -->
    <g transform="translate(0, 210)" filter="url(#card_shadow)">
      <rect width="936" height="180" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
      <text x="60" y="115" font-family="system-ui, sans-serif" font-weight="800" font-size="84" fill="#196FFD">24x7</text>
      <text x="440" y="95" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#081028">Always online</text>
      <text x="440" y="135" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#64748B">Captures late-night 11 PM enquiries</text>
    </g>

    <!-- Card 3 -->
    <g transform="translate(0, 420)" filter="url(#card_shadow)">
      <rect width="936" height="180" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
      <text x="60" y="115" font-family="system-ui, sans-serif" font-weight="800" font-size="84" fill="#196FFD">3x</text>
      <text x="440" y="95" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#081028">More site visits</text>
      <text x="440" y="135" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#64748B">Converts casual chats into viewings</text>
    </g>
  </g>

  <!-- Proof note -->
  <text x="540" y="1120" font-family="system-ui, sans-serif" font-weight="400" font-size="24" fill="#64748B" text-anchor="middle">Average metrics reported across 500+ active agency partners.</text>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#196FFD"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Book a Demo →</text>
  </g>
</svg>`,
    },
  ],
  comparison_and_education: [
    {
      slug: "02_before_after",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#F6FBF8"/>

  <!-- Header -->
  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#0F7B5F">SkyNest Realty</text>

  <!-- Headline -->
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="72" fill="#0B1F1A">Still chasing leads</text>
  <text x="72" y="260" font-family="system-ui, sans-serif" font-weight="800" font-size="72" fill="#0F7B5F">manually?</text>

  <!-- Left Card: BEFORE -->
  <g transform="translate(72, 320)" filter="url(#card_shadow)">
    <rect width="450" height="660" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
    <rect width="450" height="240" rx="20" fill="#E2E8F0"/>
    <text x="225" y="130" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#64748B" text-anchor="middle">[Before Photo Area]</text>
    
    <rect x="24" y="270" width="180" height="44" rx="8" fill="#F1F5F9"/>
    <text x="114" y="300" font-family="system-ui, sans-serif" font-weight="700" font-size="22" fill="#64748B" text-anchor="middle">MANUAL WAY</text>

    <text x="36" y="370" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#DC2626">✕ <tspan fill="#334155" font-weight="500">Slow 4-hour replies</tspan></text>
    <text x="36" y="440" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#DC2626">✕ <tspan fill="#334155" font-weight="500">Missed weekend calls</tspan></text>
    <text x="36" y="510" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#DC2626">✕ <tspan fill="#334155" font-weight="500">Lost to competitors</tspan></text>
    <text x="36" y="580" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#DC2626">✕ <tspan fill="#334155" font-weight="500">Messy paper notes</tspan></text>
  </g>

  <!-- Right Card: AFTER -->
  <g transform="translate(558, 320)" filter="url(#card_shadow)">
    <rect width="450" height="660" rx="20" fill="#FFFFFF" stroke="#0F7B5F" stroke-width="3"/>
    <rect width="450" height="240" rx="20" fill="#E6F4EA"/>
    <text x="225" y="130" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#0F7B5F" text-anchor="middle">[After Photo Area]</text>

    <rect x="24" y="270" width="180" height="44" rx="8" fill="#0F7B5F"/>
    <text x="114" y="300" font-family="system-ui, sans-serif" font-weight="700" font-size="22" fill="#FFFFFF" text-anchor="middle">WITH SKYNEST</text>

    <text x="36" y="370" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#0F7B5F">✓ <tspan fill="#0B1F1A" font-weight="600">Instant AI response</tspan></text>
    <text x="36" y="440" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#0F7B5F">✓ <tspan fill="#0B1F1A" font-weight="600">24/7 lead qualification</tspan></text>
    <text x="36" y="510" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#0F7B5F">✓ <tspan fill="#0B1F1A" font-weight="600">Auto site visit booking</tspan></text>
    <text x="36" y="580" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#0F7B5F">✓ <tspan fill="#0B1F1A" font-weight="600">Synced to your CRM</tspan></text>
  </g>

  <!-- Meet Line -->
  <text x="540" y="1060" font-family="system-ui, sans-serif" font-weight="700" font-size="38" fill="#0B1F1A" text-anchor="middle">Switch to SkyNest AI today.</text>

  <!-- CTA Pill -->
  <g transform="translate(360, 1120)">
    <rect width="360" height="96" rx="48" fill="#0F7B5F"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Book a Demo →</text>
  </g>
</svg>`,
    },
    {
      slug: "10_comparison_table",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="table_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="100" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">
    <tspan fill="#D9572B">Glowveda</tspan> vs
  </text>
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">regular serums</text>

  <!-- Table Container -->
  <g transform="translate(72, 240)" filter="url(#table_shadow)">
    <!-- Base card -->
    <rect width="936" height="820" rx="24" fill="#FFFFFF"/>

    <!-- Glowveda Highlight Column -->
    <rect x="420" y="0" width="260" height="820" rx="24" fill="#D9572B"/>

    <!-- Column Headers -->
    <text x="60" y="80" font-family="system-ui, sans-serif" font-weight="700" font-size="32" fill="#6B5249">Features</text>
    <text x="550" y="80" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="#FFFFFF" text-anchor="middle">Glowveda</text>
    <text x="810" y="80" font-family="system-ui, sans-serif" font-weight="700" font-size="32" fill="#6B5249" text-anchor="middle">Others</text>

    <!-- Divider -->
    <line x1="40" y1="120" x2="900" y2="120" stroke="#F1F5F9" stroke-width="2"/>

    <!-- Row 1 -->
    <text x="60" y="200" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#2A140B">Stable 15% Vit C</text>
    <text x="550" y="200" font-family="system-ui, sans-serif" font-weight="800" font-size="36" fill="#FFFFFF" text-anchor="middle">✓</text>
    <text x="810" y="200" font-family="system-ui, sans-serif" font-weight="700" font-size="36" fill="#DC2626" text-anchor="middle">✕</text>

    <line x1="40" y1="260" x2="900" y2="260" stroke="#F1F5F9" stroke-width="2"/>

    <!-- Row 2 -->
    <text x="60" y="340" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#2A140B">Fragrance-Free</text>
    <text x="550" y="340" font-family="system-ui, sans-serif" font-weight="800" font-size="36" fill="#FFFFFF" text-anchor="middle">✓</text>
    <text x="810" y="340" font-family="system-ui, sans-serif" font-weight="700" font-size="36" fill="#DC2626" text-anchor="middle">✕</text>

    <line x1="40" y1="400" x2="900" y2="400" stroke="#F1F5F9" stroke-width="2"/>

    <!-- Row 3 -->
    <text x="60" y="480" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#2A140B">UV-Safe Amber Glass</text>
    <text x="550" y="480" font-family="system-ui, sans-serif" font-weight="800" font-size="36" fill="#FFFFFF" text-anchor="middle">✓</text>
    <text x="810" y="480" font-family="system-ui, sans-serif" font-weight="700" font-size="36" fill="#DC2626" text-anchor="middle">✕</text>

    <line x1="40" y1="540" x2="900" y2="540" stroke="#F1F5F9" stroke-width="2"/>

    <!-- Row 4 -->
    <text x="60" y="620" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#2A140B">Tested on Indian Skin</text>
    <text x="550" y="620" font-family="system-ui, sans-serif" font-weight="800" font-size="36" fill="#FFFFFF" text-anchor="middle">✓</text>
    <text x="810" y="620" font-family="system-ui, sans-serif" font-weight="700" font-size="36" fill="#DC2626" text-anchor="middle">✕</text>

    <line x1="40" y1="680" x2="900" y2="680" stroke="#F1F5F9" stroke-width="2"/>

    <!-- Row 5 -->
    <text x="60" y="760" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#2A140B">Price per ml</text>
    <text x="550" y="760" font-family="system-ui, sans-serif" font-weight="800" font-size="32" fill="#FFFFFF" text-anchor="middle">₹26</text>
    <text x="810" y="760" font-family="system-ui, sans-serif" font-weight="700" font-size="32" fill="#6B5249" text-anchor="middle">₹45</text>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "12_pas_cards",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.06"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="100" font-family="system-ui, sans-serif" font-weight="800" font-size="70" fill="#2A140B">Dull skin that</text>
  <text x="72" y="175" font-family="system-ui, sans-serif" font-weight="800" font-size="70" fill="#D9572B">makeup can't hide?</text>

  <!-- 3 PAS Cards -->
  <!-- Card 1: PROBLEM -->
  <g transform="translate(72, 240)" filter="url(#card_shadow)">
    <rect width="936" height="230" rx="20" fill="#FFFFFF" stroke="#FEE2E2" stroke-width="2"/>
    <rect x="40" y="30" width="160" height="40" rx="8" fill="#FEE2E2"/>
    <text x="120" y="58" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#DC2626" text-anchor="middle">PROBLEM</text>
    
    <text x="40" y="125" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#2A140B">Uneven tone and dark spots</text>
    <text x="40" y="175" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">Sun damage, pollution and late nights add up over time.</text>
  </g>

  <!-- Card 2: WORSE STILL -->
  <g transform="translate(72, 510)" filter="url(#card_shadow)">
    <rect width="936" height="230" rx="20" fill="#FFFFFF" stroke="#FEF3C7" stroke-width="2"/>
    <rect x="40" y="30" width="180" height="40" rx="8" fill="#FEF3C7"/>
    <text x="130" y="58" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#D97706" text-anchor="middle">WORSE STILL</text>
    
    <text x="40" y="125" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#2A140B">Most serums oxidise in 2 weeks</text>
    <text x="40" y="175" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">You pay premium prices for Vitamin C that's already dead.</text>
  </g>

  <!-- Card 3: THE FIX -->
  <g transform="translate(72, 780)" filter="url(#card_shadow)">
    <rect width="936" height="230" rx="20" fill="#FFFFFF" stroke="#DCFCE7" stroke-width="2"/>
    <rect x="40" y="30" width="140" height="40" rx="8" fill="#DCFCE7"/>
    <text x="110" y="58" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#16A34A" text-anchor="middle">THE FIX</text>
    
    <text x="40" y="125" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#2A140B">Stable 15% Vitamin C + Ferulic</text>
    <text x="40" y="175" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">Glowveda stays crystal potent till the very last drop.</text>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1160)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "13_listicle_numbered",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.06"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda</text>
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">
    <tspan fill="#D9572B">5 reasons</tspan> it's
  </text>
  <text x="72" y="260" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">our bestseller</text>

  <!-- 5 Numbered Items -->
  <g transform="translate(72, 330)">
    <!-- Item 1 -->
    <g filter="url(#card_shadow)">
      <rect width="936" height="110" rx="16" fill="#FFFFFF"/>
      <circle cx="65" cy="55" r="28" fill="#D9572B"/>
      <text x="65" y="65" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#FFFFFF" text-anchor="middle">1</text>
      <text x="120" y="65" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B">Fades stubborn dark spots &amp; acne marks</text>
    </g>

    <!-- Item 2 -->
    <g transform="translate(0, 130)" filter="url(#card_shadow)">
      <rect width="936" height="110" rx="16" fill="#FFFFFF"/>
      <circle cx="65" cy="55" r="28" fill="#D9572B"/>
      <text x="65" y="65" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#FFFFFF" text-anchor="middle">2</text>
      <text x="120" y="65" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B">Noticeably brightens skin in 4 weeks</text>
    </g>

    <!-- Item 3 -->
    <g transform="translate(0, 260)" filter="url(#card_shadow)">
      <rect width="936" height="110" rx="16" fill="#FFFFFF"/>
      <circle cx="65" cy="55" r="28" fill="#D9572B"/>
      <text x="65" y="65" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#FFFFFF" text-anchor="middle">3</text>
      <text x="120" y="65" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B">Non-sticky, water-light &amp; absorbs fast</text>
    </g>

    <!-- Item 4 -->
    <g transform="translate(0, 390)" filter="url(#card_shadow)">
      <rect width="936" height="110" rx="16" fill="#FFFFFF"/>
      <circle cx="65" cy="55" r="28" fill="#D9572B"/>
      <text x="65" y="65" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#FFFFFF" text-anchor="middle">4</text>
      <text x="120" y="65" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B">100% Fragrance-free, vegan &amp; clean</text>
    </g>

    <!-- Item 5 -->
    <g transform="translate(0, 520)" filter="url(#card_shadow)">
      <rect width="936" height="110" rx="16" fill="#FFFFFF"/>
      <circle cx="65" cy="55" r="28" fill="#D9572B"/>
      <text x="65" y="65" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#FFFFFF" text-anchor="middle">5</text>
      <text x="120" y="65" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B">Specially formulated for Indian climate</text>
    </g>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "14_steps_connector",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.06"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda Ritual</text>
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">How to use</text>
  <text x="72" y="260" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">for <tspan fill="#D9572B">best results</tspan></text>

  <!-- Steps with Connector Line -->
  <g transform="translate(72, 330)">
    <!-- Vertical Connector Line -->
    <line x1="60" y1="90" x2="60" y2="570" stroke="#D9572B" stroke-width="6"/>

    <!-- Step 1 -->
    <g filter="url(#card_shadow)">
      <rect width="936" height="180" rx="20" fill="#FFFFFF"/>
      <circle cx="60" cy="90" r="36" fill="#D9572B"/>
      <text x="60" y="102" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="#FFFFFF" text-anchor="middle">1</text>
      <text x="140" y="80" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#2A140B">Cleanse Gently</text>
      <text x="140" y="125" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">Wash with lukewarm water and pat skin dry.</text>
    </g>

    <!-- Step 2 -->
    <g transform="translate(0, 240)" filter="url(#card_shadow)">
      <rect width="936" height="180" rx="20" fill="#FFFFFF"/>
      <circle cx="60" cy="90" r="36" fill="#D9572B"/>
      <text x="60" y="102" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="#FFFFFF" text-anchor="middle">2</text>
      <text x="140" y="80" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#2A140B">2-3 Drops</text>
      <text x="140" y="125" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">Press gently into face, neck, and décolleté.</text>
    </g>

    <!-- Step 3 -->
    <g transform="translate(0, 480)" filter="url(#card_shadow)">
      <rect width="936" height="180" rx="20" fill="#FFFFFF"/>
      <circle cx="60" cy="90" r="36" fill="#D9572B"/>
      <text x="60" y="102" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="#FFFFFF" text-anchor="middle">3</text>
      <text x="140" y="80" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#2A140B">Moisturise + SPF</text>
      <text x="140" y="125" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">Lock in actives with sunscreen every morning.</text>
    </g>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "15_faq_objections",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.06"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda FAQ</text>
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B"><tspan fill="#D9572B">Questions</tspan> before</text>
  <text x="72" y="260" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">you try it?</text>

  <!-- 3 Q&A Cards -->
  <g transform="translate(72, 330)">
    <!-- Card 1 -->
    <g filter="url(#card_shadow)">
      <rect width="936" height="200" rx="20" fill="#FFFFFF"/>
      <rect x="36" y="30" width="44" height="44" rx="8" fill="#FBD5C5"/>
      <text x="58" y="62" font-family="system-ui, sans-serif" font-weight="800" font-size="24" fill="#D9572B" text-anchor="middle">Q</text>
      <text x="100" y="62" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B">Will it suit oily or acne-prone skin?</text>
      <text x="36" y="125" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">Yes! It is completely water-light, non-comedogenic,</text>
      <text x="36" y="165" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">and absorbs without clogging pores or leaving grease.</text>
    </g>

    <!-- Card 2 -->
    <g transform="translate(0, 240)" filter="url(#card_shadow)">
      <rect width="936" height="200" rx="20" fill="#FFFFFF"/>
      <rect x="36" y="30" width="44" height="44" rx="8" fill="#FBD5C5"/>
      <text x="58" y="62" font-family="system-ui, sans-serif" font-weight="800" font-size="24" fill="#D9572B" text-anchor="middle">Q</text>
      <text x="100" y="62" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B">Can I use it alongside retinol?</text>
      <text x="36" y="125" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">Yes. We recommend applying Vitamin C in the morning</text>
      <text x="36" y="165" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">for antioxidant protection, and retinol at night.</text>
    </g>

    <!-- Card 3 -->
    <g transform="translate(0, 480)" filter="url(#card_shadow)">
      <rect width="936" height="200" rx="20" fill="#FFFFFF"/>
      <rect x="36" y="30" width="44" height="44" rx="8" fill="#FBD5C5"/>
      <text x="58" y="62" font-family="system-ui, sans-serif" font-weight="800" font-size="24" fill="#D9572B" text-anchor="middle">Q</text>
      <text x="100" y="62" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B">How soon will I see visible results?</text>
      <text x="36" y="125" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">Most users notice glowing hydration within 14 days;</text>
      <text x="36" y="165" font-family="system-ui, sans-serif" font-weight="400" font-size="26" fill="#6B5249">pigmentation and dark spots fade visibly in 4 weeks.</text>
    </g>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
  ],
  product_and_feature_showcase: [
    {
      slug: "01_hero_photo",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim_top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B1F1A" stop-opacity="0.95"/>
      <stop offset="60%" stop-color="#0B1F1A" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#0B1F1A" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="scrim_bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B1F1A" stop-opacity="0"/>
      <stop offset="100%" stop-color="#0B1F1A" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- Background Placeholder -->
  <rect width="1080" height="1350" fill="#1C3831"/>
  <rect width="1080" height="650" fill="url(#scrim_top)"/>
  <rect y="950" width="1080" height="400" fill="url(#scrim_bottom)"/>

  <!-- Header -->
  <text x="72" y="100" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#FFFFFF">SkyNest Realty</text>

  <!-- Kicker -->
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#E6BA5A">24/7 INSTANT LEAD ENGINE</text>

  <!-- Headline -->
  <text x="72" y="270" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#FFFFFF">Leads go cold</text>
  <text x="72" y="360" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#FFFFFF">while you're <tspan fill="#E6BA5A">busy.</tspan></text>

  <!-- Subtext -->
  <text x="72" y="440" font-family="system-ui, sans-serif" font-weight="400" font-size="34" fill="#C5D3CE">Our WhatsApp AI replies to every enquiry</text>
  <text x="72" y="485" font-family="system-ui, sans-serif" font-weight="400" font-size="34" fill="#C5D3CE">instantly, even at midnight.</text>

  <!-- CTA Pill -->
  <g transform="translate(72, 1120)" filter="url(#shadow)">
    <rect width="360" height="96" rx="48" fill="#0F7B5F"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Claim Free Demo →</text>
  </g>

  <!-- Footer URL -->
  <text x="1008" y="1300" font-family="system-ui, sans-serif" font-weight="500" font-size="28" fill="#FFFFFF" opacity="0.8" text-anchor="end">skynest.example</text>
</svg>`,
    },
    {
      slug: "03_feature_showcase",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="phone_shadow" x="-10%" y="-5%" width="120%" height="115%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#F8FAFC"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#0F7B5F">SkyNest Realty</text>
  <text x="72" y="150" font-family="system-ui, sans-serif" font-weight="600" font-size="30" fill="#0F7B5F">For real estate brokers</text>
  
  <text x="72" y="230" font-family="system-ui, sans-serif" font-weight="800" font-size="64" fill="#0F172A">Every lead answered,</text>
  <text x="72" y="300" font-family="system-ui, sans-serif" font-weight="800" font-size="64" fill="#0F172A">qualified and <tspan fill="#0F7B5F">booked.</tspan></text>

  <!-- Phone Frame Mockup -->
  <g transform="translate(190, 370)" filter="url(#phone_shadow)">
    <rect width="700" height="720" rx="36" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="4"/>
    
    <!-- App Header Bar -->
    <rect width="700" height="90" rx="36" fill="#0F7B5F"/>
    <rect y="50" width="700" height="40" fill="#0F7B5F"/>
    <text x="350" y="58" font-family="system-ui, sans-serif" font-weight="700" font-size="32" fill="#FFFFFF" text-anchor="middle">SkyNest Assistant</text>

    <!-- 4 Feature Rows -->
    <g transform="translate(40, 130)">
      <rect width="620" height="110" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
      <circle cx="55" cy="55" r="28" fill="#E6F4EA"/>
      <text x="55" y="65" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#0F7B5F" text-anchor="middle">✓</text>
      <text x="110" y="52" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#0F172A">Instant WhatsApp replies</text>
      <text x="110" y="84" font-family="system-ui, sans-serif" font-weight="400" font-size="22" fill="#64748B">Replies in &lt;60s to every ad click</text>
    </g>

    <g transform="translate(40, 265)">
      <rect width="620" height="110" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
      <circle cx="55" cy="55" r="28" fill="#E6F4EA"/>
      <text x="55" y="65" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#0F7B5F" text-anchor="middle">✓</text>
      <text x="110" y="52" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#0F172A">Budget &amp; Location capture</text>
      <text x="110" y="84" font-family="system-ui, sans-serif" font-weight="400" font-size="22" fill="#64748B">Filters serious buyers automatically</text>
    </g>

    <g transform="translate(40, 400)">
      <rect width="620" height="110" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
      <circle cx="55" cy="55" r="28" fill="#E6F4EA"/>
      <text x="55" y="65" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#0F7B5F" text-anchor="middle">✓</text>
      <text x="110" y="52" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#0F172A">Site visit booking</text>
      <text x="110" y="84" font-family="system-ui, sans-serif" font-weight="400" font-size="22" fill="#64748B">Confirms Sunday viewing slots</text>
    </g>

    <g transform="translate(40, 535)">
      <rect width="620" height="110" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
      <circle cx="55" cy="55" r="28" fill="#E6F4EA"/>
      <text x="55" y="65" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#0F7B5F" text-anchor="middle">✓</text>
      <text x="110" y="52" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#0F172A">Leads synced to CRM</text>
      <text x="110" y="84" font-family="system-ui, sans-serif" font-weight="400" font-size="22" fill="#64748B">No manual data entry required</text>
    </g>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#0F7B5F"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Get Started →</text>
  </g>
</svg>`,
    },
    {
      slug: "07_product_hero",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <!-- Top Scrim Overlay for headline clarity -->
  <defs>
    <linearGradient id="scrim_top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFF5EE" stop-opacity="0.95"/>
      <stop offset="65%" stop-color="#FFF5EE" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#FFF5EE" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="550" fill="url(#scrim_top)"/>

  <!-- Header & Kicker -->
  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda</text>
  <text x="72" y="160" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#D9572B">15% Vitamin C + Ferulic Acid</text>

  <!-- Headline -->
  <text x="72" y="250" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">Brighter skin</text>
  <text x="72" y="340" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">in <tspan fill="#D9572B">4 weeks.</tspan></text>

  <!-- Benefit Chips Row -->
  <g transform="translate(72, 380)">
    <rect width="270" height="54" rx="27" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="2"/>
    <text x="135" y="36" font-family="system-ui, sans-serif" font-weight="600" font-size="22" fill="#6B5249" text-anchor="middle">✓ Derm tested</text>

    <rect x="290" width="240" height="54" rx="27" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="2"/>
    <text x="410" y="36" font-family="system-ui, sans-serif" font-weight="600" font-size="22" fill="#6B5249" text-anchor="middle">✓ Fragrance-free</text>

    <rect x="550" width="180" height="54" rx="27" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="2"/>
    <text x="640" y="36" font-family="system-ui, sans-serif" font-weight="600" font-size="22" fill="#6B5249" text-anchor="middle">✓ 100% Vegan</text>
  </g>

  <!-- Product Area Placeholder -->
  <g transform="translate(140, 500)">
    <rect width="800" height="580" rx="24" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="2" opacity="0.8"/>
    <text x="400" y="300" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#D9572B" text-anchor="middle">[E-Commerce Packshot on Pedestal]</text>
  </g>

  <!-- Price Tag Pill -->
  <g transform="translate(72, 1170)">
    <rect width="200" height="96" rx="48" fill="#2A140B"/>
    <text x="100" y="60" font-family="system-ui, sans-serif" font-weight="800" font-size="38" fill="#FFFFFF" text-anchor="middle">₹799</text>
  </g>

  <!-- CTA -->
  <g transform="translate(300, 1170)">
    <rect width="420" height="96" rx="48" fill="#D9572B"/>
    <text x="210" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "24_feature_callouts",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="pill_shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.1"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda</text>
  <text x="72" y="175" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">What's <tspan fill="#D9572B">inside</tspan></text>

  <!-- Center Packshot Bottle Placeholder -->
  <g transform="translate(390, 320)">
    <rect width="300" height="680" rx="40" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="3"/>
    <text x="150" y="360" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#D9572B" text-anchor="middle">[Serum Bottle]</text>
  </g>

  <!-- Leader Line 1: Top Left -->
  <line x1="320" y1="460" x2="480" y2="460" stroke="#D9572B" stroke-width="3" stroke-dasharray="6 4"/>
  <circle cx="480" cy="460" r="8" fill="#D9572B"/>
  <g transform="translate(72, 410)" filter="url(#pill_shadow)">
    <rect width="260" height="96" rx="16" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="1.5"/>
    <text x="30" y="42" font-family="system-ui, sans-serif" font-weight="700" font-size="26" fill="#2A140B">15% Vitamin C</text>
    <text x="30" y="74" font-family="system-ui, sans-serif" font-weight="500" font-size="20" fill="#6B5249">Fades dark spots</text>
  </g>

  <!-- Leader Line 2: Middle Right -->
  <line x1="600" y1="620" x2="740" y2="620" stroke="#D9572B" stroke-width="3" stroke-dasharray="6 4"/>
  <circle cx="600" cy="620" r="8" fill="#D9572B"/>
  <g transform="translate(740, 570)" filter="url(#pill_shadow)">
    <rect width="260" height="96" rx="16" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="1.5"/>
    <text x="30" y="42" font-family="system-ui, sans-serif" font-weight="700" font-size="26" fill="#2A140B">1% Ferulic Acid</text>
    <text x="30" y="74" font-family="system-ui, sans-serif" font-weight="500" font-size="20" fill="#6B5249">Stabilizes active C</text>
  </g>

  <!-- Leader Line 3: Bottom Left -->
  <line x1="320" y1="840" x2="480" y2="840" stroke="#D9572B" stroke-width="3" stroke-dasharray="6 4"/>
  <circle cx="480" cy="840" r="8" fill="#D9572B"/>
  <g transform="translate(72, 790)" filter="url(#pill_shadow)">
    <rect width="260" height="96" rx="16" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="1.5"/>
    <text x="30" y="42" font-family="system-ui, sans-serif" font-weight="700" font-size="26" fill="#2A140B">Amber Glass</text>
    <text x="30" y="74" font-family="system-ui, sans-serif" font-weight="500" font-size="20" fill="#6B5249">Zero UV oxidation</text>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "29_lifestyle_chips",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim_top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2A140B" stop-opacity="0.9"/>
      <stop offset="60%" stop-color="#2A140B" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#2A140B" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1080" height="1350" fill="#3D1E13"/>
  <rect width="1080" height="550" fill="url(#scrim_top)"/>

  <!-- Top Header -->
  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#F2B544">Glowveda Ritual</text>
  <text x="72" y="160" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#F2B544">2 drops. Every morning.</text>

  <!-- Headline -->
  <text x="72" y="250" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#FFFFFF">The daily serum</text>
  <text x="72" y="340" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#FFFFFF">you <tspan fill="#F2B544">won't skip.</tspan></text>

  <!-- Lifestyle Photo Area Placeholder -->
  <text x="540" y="750" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFF5EE" opacity="0.6" text-anchor="middle">[Model In-Use Lifestyle Photo]</text>

  <!-- Floating Sensory Chips -->
  <g transform="translate(72, 1020)">
    <rect width="250" height="60" rx="30" fill="#FFFFFF" fill-opacity="0.95"/>
    <text x="125" y="40" font-family="system-ui, sans-serif" font-weight="700" font-size="24" fill="#2A140B" text-anchor="middle">✨ Weightless Feel</text>

    <rect x="270" width="260" height="60" rx="30" fill="#FFFFFF" fill-opacity="0.95"/>
    <text x="400" y="40" font-family="system-ui, sans-serif" font-weight="700" font-size="24" fill="#2A140B" text-anchor="middle">🌿 Zero Stickiness</text>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1160)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
  ],
  native_and_social_mockups: [
    {
      slug: "05_chat_mock",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="phone_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000" flood-opacity="0.14"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#F0FDF4"/>

  <text x="72" y="80" font-family="system-ui, sans-serif" font-weight="600" font-size="30" fill="#0F7B5F">How it works</text>
  <text x="72" y="160" font-family="system-ui, sans-serif" font-weight="800" font-size="70" fill="#0B1F1A">From ad tap</text>
  <text x="72" y="240" font-family="system-ui, sans-serif" font-weight="800" font-size="70" fill="#0B1F1A">to <tspan fill="#0F7B5F">site visit.</tspan></text>

  <!-- Phone Mockup Container -->
  <g transform="translate(190, 290)" filter="url(#phone_shadow)">
    <rect width="700" height="820" rx="36" fill="#ECE5DD" stroke="#075E54" stroke-width="4"/>
    
    <!-- WhatsApp Green Header -->
    <rect width="700" height="90" rx="36" fill="#075E54"/>
    <rect y="45" width="700" height="45" fill="#075E54"/>
    <circle cx="65" cy="45" r="26" fill="#FFFFFF"/>
    <text x="65" y="54" font-family="system-ui, sans-serif" font-weight="700" font-size="24" fill="#075E54" text-anchor="middle">AI</text>
    <text x="110" y="42" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#FFFFFF">SkyNest Real Estate AI</text>
    <text x="110" y="70" font-family="system-ui, sans-serif" font-weight="400" font-size="20" fill="#A7F3D0">online</text>

    <!-- Chat Messages -->
    <!-- Msg 1: Customer -->
    <g transform="translate(30, 120)">
      <rect width="360" height="70" rx="14" fill="#FFFFFF"/>
      <text x="24" y="44" font-family="system-ui, sans-serif" font-weight="500" font-size="26" fill="#111827">Hi, I saw your 3 BHK ad.</text>
      <text x="320" y="58" font-family="system-ui, sans-serif" font-size="16" fill="#9CA3AF">11:02 PM</text>
    </g>

    <!-- Msg 2: AI Reply -->
    <g transform="translate(260, 210)">
      <rect width="410" height="80" rx="14" fill="#D9FDD3"/>
      <text x="24" y="38" font-family="system-ui, sans-serif" font-weight="500" font-size="26" fill="#111827">Hi! We have 2 units left in</text>
      <text x="24" y="68" font-family="system-ui, sans-serif" font-weight="500" font-size="26" fill="#111827">Sector 62. What is your budget?</text>
    </g>

    <!-- Msg 3: Customer -->
    <g transform="translate(30, 310)">
      <rect width="280" height="70" rx="14" fill="#FFFFFF"/>
      <text x="24" y="44" font-family="system-ui, sans-serif" font-weight="500" font-size="26" fill="#111827">Around 1.2 Crore</text>
    </g>

    <!-- Msg 4: AI Reply -->
    <g transform="translate(240, 400)">
      <rect width="430" height="80" rx="14" fill="#D9FDD3"/>
      <text x="24" y="38" font-family="system-ui, sans-serif" font-weight="500" font-size="26" fill="#111827">Perfect. Can we schedule a site</text>
      <text x="24" y="68" font-family="system-ui, sans-serif" font-weight="500" font-size="26" fill="#111827">visit this Sunday at 11 AM?</text>
    </g>

    <!-- Msg 5: Customer -->
    <g transform="translate(30, 500)">
      <rect width="320" height="70" rx="14" fill="#FFFFFF"/>
      <text x="24" y="44" font-family="system-ui, sans-serif" font-weight="500" font-size="26" fill="#111827">Yes, Sunday works!</text>
    </g>

    <!-- Success Chip Badge -->
    <g transform="translate(180, 620)">
      <rect width="340" height="64" rx="32" fill="#25D366"/>
      <text x="170" y="42" font-family="system-ui, sans-serif" font-weight="700" font-size="26" fill="#FFFFFF" text-anchor="middle">✓ Site Visit Confirmed</text>
    </g>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#0F7B5F"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Get Started →</text>
  </g>
</svg>`,
    },
    {
      slug: "11_ugc_story_stickers",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="sticker_shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#3A2016"/>

  <!-- Simulated Phone Photo Area -->
  <rect x="72" y="72" width="936" height="1206" rx="32" fill="#2A140B" stroke="#6B5249" stroke-width="2"/>
  <text x="540" y="600" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFF5EE" text-anchor="middle" opacity="0.6">[Amateur Smartphone UGC Photo]</text>

  <!-- Floating Story Caption Sticker 1 -->
  <g transform="translate(180, 240) rotate(-3)" filter="url(#sticker_shadow)">
    <rect width="480" height="84" rx="16" fill="#FFFFFF" fill-opacity="0.95"/>
    <text x="240" y="54" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#0F172A" text-anchor="middle">ok I finally get the hype</text>
  </g>

  <!-- Floating Story Caption Sticker 2 -->
  <g transform="translate(240, 360) rotate(2)" filter="url(#sticker_shadow)">
    <rect width="540" height="84" rx="16" fill="#FFFFFF" fill-opacity="0.95"/>
    <text x="270" y="54" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#0F172A" text-anchor="middle">week 3 on this serum ✨</text>
  </g>

  <!-- Social Handle Pill -->
  <g transform="translate(72, 1140)">
    <rect width="320" height="64" rx="32" fill="#000000" fill-opacity="0.6"/>
    <text x="160" y="42" font-family="system-ui, sans-serif" font-weight="600" font-size="26" fill="#FFFFFF" text-anchor="middle">@ananya.skin</text>
  </g>

  <!-- Native CTA Pill -->
  <g transform="translate(680, 1130)">
    <rect width="320" height="84" rx="42" fill="#D9572B"/>
    <text x="160" y="52" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "20_notes_app_mockup",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <!-- Warm Yellowish Paper Background -->
  <rect width="1080" height="1350" fill="#FFFCF0"/>

  <!-- Top iOS Header Bar -->
  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="500" font-size="36" fill="#E2AA00">‹ Notes</text>
  <text x="1008" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="36" fill="#E2AA00" text-anchor="end">Done</text>

  <!-- Title -->
  <text x="72" y="200" font-family="system-ui, sans-serif" font-weight="800" font-size="64" fill="#1C1917">my 2-minute AM routine</text>
  <text x="72" y="260" font-family="system-ui, sans-serif" font-weight="400" font-size="28" fill="#78716C">October 28 at 8:45 AM</text>

  <!-- Checklist Lines -->
  <g transform="translate(72, 360)">
    <!-- Item 1 -->
    <g>
      <circle cx="36" cy="36" r="28" fill="#E2AA00"/>
      <text x="36" y="47" font-family="system-ui, sans-serif" font-weight="800" font-size="32" fill="#FFFFFF" text-anchor="middle">✓</text>
      <text x="90" y="48" font-family="system-ui, sans-serif" font-weight="500" font-size="44" fill="#292524">gentle cleanser</text>
    </g>

    <!-- Item 2 -->
    <g transform="translate(0, 110)">
      <circle cx="36" cy="36" r="28" fill="#E2AA00"/>
      <text x="36" y="47" font-family="system-ui, sans-serif" font-weight="800" font-size="32" fill="#FFFFFF" text-anchor="middle">✓</text>
      <text x="90" y="48" font-family="system-ui, sans-serif" font-weight="700" font-size="44" fill="#D9572B">3 drops Glowveda Vit C serum</text>
    </g>

    <!-- Item 3 -->
    <g transform="translate(0, 220)">
      <circle cx="36" cy="36" r="28" fill="#E2AA00"/>
      <text x="36" y="47" font-family="system-ui, sans-serif" font-weight="800" font-size="32" fill="#FFFFFF" text-anchor="middle">✓</text>
      <text x="90" y="48" font-family="system-ui, sans-serif" font-weight="500" font-size="44" fill="#292524">ceramide moisturiser</text>
    </g>

    <!-- Item 4 (Unchecked) -->
    <g transform="translate(0, 330)">
      <circle cx="36" cy="36" r="26" fill="none" stroke="#D6D3D1" stroke-width="3"/>
      <text x="90" y="48" font-family="system-ui, sans-serif" font-weight="500" font-size="44" fill="#78716C">spf 50 (always forget lol)</text>
    </g>
  </g>

  <!-- Note closing -->
  <text x="72" y="860" font-family="system-ui, sans-serif" font-weight="400" font-size="40" fill="#44403C" font-style="italic">
    "that's literally it. skin has never looked this even."
  </text>

  <!-- Brand Signature Footer -->
  <line x1="72" y1="1050" x2="1008" y2="1050" stroke="#E7E5E4" stroke-width="2"/>
  <text x="72" y="1120" font-family="system-ui, sans-serif" font-weight="700" font-size="36" fill="#1C1917">Glowveda Skincare</text>

  <!-- CTA -->
  <g transform="translate(680, 1070)">
    <rect width="320" height="88" rx="44" fill="#D9572B"/>
    <text x="160" y="54" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "28_meme_topbottom",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1350" fill="#1E293B"/>

  <!-- Meme Image Placeholder -->
  <rect x="36" y="36" width="1008" height="1278" fill="#334155"/>
  <text x="540" y="680" font-family="system-ui, sans-serif" font-weight="700" font-size="44" fill="#94A3B8" text-anchor="middle">[Exaggerated Reaction Photo]</text>

  <!-- Top Impact Text -->
  <text x="540" y="180" font-family="Impact, system-ui, sans-serif" font-weight="900" font-size="84" fill="#FFFFFF" stroke="#000000" stroke-width="12" stroke-linejoin="round" text-anchor="middle">
    WHEN YOUR 10-STEP ROUTINE
  </text>
  <text x="540" y="180" font-family="Impact, system-ui, sans-serif" font-weight="900" font-size="84" fill="#FFFFFF" text-anchor="middle">
    WHEN YOUR 10-STEP ROUTINE
  </text>

  <!-- Bottom Impact Text -->
  <text x="540" y="1200" font-family="Impact, system-ui, sans-serif" font-weight="900" font-size="84" fill="#FFFFFF" stroke="#000000" stroke-width="12" stroke-linejoin="round" text-anchor="middle">
    COULD HAVE BEEN ONE SERUM
  </text>
  <text x="540" y="1200" font-family="Impact, system-ui, sans-serif" font-weight="900" font-size="84" fill="#FFFFFF" text-anchor="middle">
    COULD HAVE BEEN ONE SERUM
  </text>
</svg>`,
    },
    {
      slug: "30_carousel_card",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda Skincare</text>

  <!-- Main Card -->
  <g transform="translate(72, 180)" filter="url(#card_shadow)">
    <rect width="936" height="960" rx="32" fill="#FFFFFF"/>

    <text x="80" y="120" font-family="system-ui, sans-serif" font-weight="700" font-size="34" fill="#D9572B">Myth 1 vs Reality</text>

    <text x="80" y="240" font-family="system-ui, sans-serif" font-weight="900" font-size="76" fill="#2A140B">
      <tspan x="80" dy="0">"More steps =</tspan>
      <tspan x="80" dy="84">more glow"</tspan>
    </text>

    <!-- Graphic Box inside -->
    <rect x="80" y="400" width="776" height="360" rx="20" fill="#FFF5EE" stroke="#FBD5C5" stroke-width="2"/>
    <text x="468" y="560" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#6B5249" text-anchor="middle">[Carousel Step Graphic / Visual]</text>

    <text x="80" y="840" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#2A140B">
      Truth: One stable, active formula beats 10 random layers.
    </text>

    <!-- Bottom Swipe Pill -->
    <g transform="translate(680, 860)">
      <rect width="176" height="54" rx="27" fill="#D9572B"/>
      <text x="88" y="36" font-family="system-ui, sans-serif" font-weight="700" font-size="24" fill="#FFFFFF" text-anchor="middle">Swipe ➔</text>
    </g>
  </g>

  <!-- Slide Dots Indicator -->
  <g transform="translate(500, 1200)">
    <circle cx="0" cy="0" r="10" fill="#D9572B"/>
    <circle cx="36" cy="0" r="10" fill="#D6D3D1"/>
    <circle cx="72" cy="0" r="10" fill="#D6D3D1"/>
    <circle cx="108" cy="0" r="10" fill="#D6D3D1"/>
  </g>
</svg>`,
    },
  ],
  offers_and_conversion_urgency: [
    {
      slug: "06_offer_discount",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000" flood-opacity="0.15"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <!-- Top Header -->
  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda Skincare</text>
  <text x="72" y="160" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#D9572B">Diwali Glow Sale</text>

  <!-- Headline -->
  <text x="72" y="250" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">Your glow, now</text>
  <text x="72" y="340" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#D9572B">40% lighter</text>
  <text x="72" y="420" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">on the wallet.</text>

  <!-- 16-Point Starburst Discount Badge -->
  <g transform="translate(850, 260)" filter="url(#shadow)">
    <!-- 16-point star polygon -->
    <polygon points="
      0,-140 38,-135 73,-119 101,-93 119,-60 135,-24 140,14 133,52 115,86 87,112 51,128 12,140 -27,134 -63,117 -92,89 -112,54 -122,15 -118,-25 -103,-62 -77,-95 -43,-124
    " fill="#D9572B"/>
    <text x="0" y="-12" font-family="system-ui, sans-serif" font-weight="900" font-size="52" fill="#FFFFFF" text-anchor="middle">40%</text>
    <text x="0" y="42" font-family="system-ui, sans-serif" font-weight="800" font-size="36" fill="#FFFFFF" text-anchor="middle">OFF</text>
  </g>

  <!-- Product Photo Placeholder Card -->
  <g transform="translate(140, 480)">
    <rect width="800" height="480" rx="24" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="2"/>
    <text x="400" y="250" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#6B5249" text-anchor="middle">[Packshot / Flat Lay Product Image]</text>
  </g>

  <!-- Coupon Code Pill -->
  <g transform="translate(340, 1010)">
    <rect width="400" height="74" rx="37" fill="#FFFFFF" stroke="#D9572B" stroke-width="2.5" stroke-dasharray="8 6"/>
    <text x="200" y="47" font-family="monospace" font-weight="700" font-size="30" fill="#D9572B" text-anchor="middle">USE CODE: GLOW40</text>
  </g>

  <!-- Urgency & Terms -->
  <text x="540" y="1130" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#D9572B" text-anchor="middle">⚡ Ends Sunday midnight</text>
  <text x="540" y="1170" font-family="system-ui, sans-serif" font-weight="400" font-size="22" fill="#6B5249" text-anchor="middle">T&amp;C apply. On MRP. Valid till stocks last.</text>

  <!-- CTA -->
  <g transform="translate(360, 1210)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "18_countdown_timer",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="box_shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#2A140B"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="36" fill="#F2B544">⚡ Last chance</text>
  <text x="72" y="190" font-family="system-ui, sans-serif" font-weight="900" font-size="84" fill="#FFFFFF">Flash Sale</text>
  <text x="72" y="280" font-family="system-ui, sans-serif" font-weight="900" font-size="84" fill="#FFFFFF">ends in:</text>

  <!-- 3 Timer Boxes -->
  <g transform="translate(72, 360)">
    <!-- Box 1: DAYS -->
    <g filter="url(#box_shadow)">
      <rect width="280" height="260" rx="24" fill="#3A1A0E" stroke="#D9572B" stroke-width="3"/>
      <text x="140" y="150" font-family="system-ui, sans-serif" font-weight="900" font-size="120" fill="#FFFFFF" text-anchor="middle">02</text>
      <text x="140" y="210" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#F2B544" text-anchor="middle">DAYS</text>
    </g>

    <!-- Box 2: HRS -->
    <g transform="translate(328, 0)" filter="url(#box_shadow)">
      <rect width="280" height="260" rx="24" fill="#3A1A0E" stroke="#D9572B" stroke-width="3"/>
      <text x="140" y="150" font-family="system-ui, sans-serif" font-weight="900" font-size="120" fill="#FFFFFF" text-anchor="middle">11</text>
      <text x="140" y="210" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#F2B544" text-anchor="middle">HOURS</text>
    </g>

    <!-- Box 3: MIN -->
    <g transform="translate(656, 0)" filter="url(#box_shadow)">
      <rect width="280" height="260" rx="24" fill="#3A1A0E" stroke="#D9572B" stroke-width="3"/>
      <text x="140" y="150" font-family="system-ui, sans-serif" font-weight="900" font-size="120" fill="#FFFFFF" text-anchor="middle">45</text>
      <text x="140" y="210" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#F2B544" text-anchor="middle">MINUTES</text>
    </g>
  </g>

  <!-- Background Photo Area Placeholder -->
  <g transform="translate(72, 680)">
    <rect width="936" height="380" rx="24" fill="#3A1A0E" stroke="#6B5249" stroke-width="2"/>
    <text x="468" y="200" font-family="system-ui, sans-serif" font-weight="600" font-size="34" fill="#FFF5EE" opacity="0.6" text-anchor="middle">[Flat Lay Bundle / Prize Image]</text>
  </g>

  <!-- Deadline text -->
  <text x="540" y="1120" font-family="system-ui, sans-serif" font-weight="700" font-size="32" fill="#F2B544" text-anchor="middle">40% OFF discount ends Sunday at 11:59 PM</text>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "19_announcement_ribbon",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <!-- Top Right Corner "NEW" Ribbon -->
  <g transform="translate(860, 60)">
    <rect width="160" height="64" rx="32" fill="#DC2626"/>
    <text x="80" y="44" font-family="system-ui, sans-serif" font-weight="900" font-size="30" fill="#FFFFFF" text-anchor="middle">NEW</text>
  </g>

  <!-- Header -->
  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda</text>
  <text x="72" y="160" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#D9572B">Just Launched</text>

  <!-- Headline -->
  <text x="72" y="250" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">Vitamin C 15%</text>
  <text x="72" y="340" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">is <tspan fill="#D9572B">finally here.</tspan></text>

  <!-- Chips -->
  <g transform="translate(72, 390)">
    <rect width="250" height="52" rx="26" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="2"/>
    <text x="125" y="35" font-family="system-ui, sans-serif" font-weight="600" font-size="22" fill="#6B5249" text-anchor="middle">✨ Ultra-Stable</text>

    <rect x="270" width="280" height="52" rx="26" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="2"/>
    <text x="410" y="35" font-family="system-ui, sans-serif" font-weight="600" font-size="22" fill="#6B5249" text-anchor="middle">🛡️ UV-Safe Amber Glass</text>
  </g>

  <!-- Product Photo Placeholder -->
  <g transform="translate(140, 500)">
    <rect width="800" height="600" rx="24" fill="#FFFFFF" stroke="#FBD5C5" stroke-width="2"/>
    <text x="400" y="310" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#D9572B" text-anchor="middle">[New Product Hero Packshot]</text>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Try It First →</text>
  </g>
</svg>`,
    },
    {
      slug: "22_giveaway_promo",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1350" fill="#2A140B"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#F2B544">Glowveda</text>
  <text x="540" y="200" font-family="system-ui, sans-serif" font-weight="900" font-size="110" fill="#D9572B" text-anchor="middle">GIVEAWAY</text>
  <text x="540" y="270" font-family="system-ui, sans-serif" font-weight="700" font-size="42" fill="#FFFFFF" text-anchor="middle">Win a full Glow Kit worth ₹2,499</text>

  <!-- Prize Image Area -->
  <g transform="translate(72, 330)">
    <rect width="936" height="420" rx="24" fill="#3A1A0E" stroke="#D9572B" stroke-width="2"/>
    <text x="468" y="220" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFF5EE" opacity="0.6" text-anchor="middle">[Prize Unboxing Flat Lay Image]</text>
  </g>

  <!-- 3 Entry Steps -->
  <g transform="translate(72, 800)">
    <rect width="936" height="260" rx="20" fill="#3A1A0E"/>
    <text x="60" y="60" font-family="system-ui, sans-serif" font-weight="800" font-size="28" fill="#F2B544">HOW TO ENTER (Takes 30 seconds):</text>
    <text x="60" y="115" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#FFFFFF">1. Follow @glowveda on Instagram</text>
    <text x="60" y="165" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#FFFFFF">2. Tag 2 skincare-loving friends in comments</text>
    <text x="60" y="215" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#FFFFFF">3. Share this post to your story for bonus entry</text>
  </g>

  <!-- Deadline & Terms -->
  <text x="540" y="1120" font-family="system-ui, sans-serif" font-weight="600" font-size="24" fill="#F2B544" text-anchor="middle">Winners announced 5 Nov on our story · T&amp;C apply · Not sponsored by Meta</text>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Enter Now →</text>
  </g>
</svg>`,
    },
    {
      slug: "25_pricing_tiers",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="tier_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000" flood-opacity="0.1"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="40" fill="#D9572B">Glowveda Packs</text>
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">Pick your <tspan fill="#D9572B">glow pack</tspan></text>

  <!-- 3 Side-by-Side Tier Cards -->
  <g transform="translate(72, 260)">
    <!-- Tier 1: Single -->
    <g transform="translate(0, 40)">
      <rect width="295" height="740" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
      <text x="147" y="60" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B" text-anchor="middle">Single</text>
      <text x="147" y="130" font-family="system-ui, sans-serif" font-weight="900" font-size="48" fill="#2A140B" text-anchor="middle">₹799</text>
      <text x="147" y="170" font-family="system-ui, sans-serif" font-weight="500" font-size="20" fill="#6B5249" text-anchor="middle">Standard pack</text>
      <line x1="30" y1="210" x2="265" y2="210" stroke="#F1F5F9" stroke-width="2"/>
      
      <text x="40" y="270" font-family="system-ui, sans-serif" font-size="22" fill="#2A140B">✓ 1 Serum (30 ml)</text>
      <text x="40" y="330" font-family="system-ui, sans-serif" font-size="22" fill="#2A140B">✓ Standard delivery</text>
    </g>

    <!-- Tier 2: DUO (Highlighted Raised Card) -->
    <g transform="translate(320, 0)" filter="url(#tier_shadow)">
      <rect width="295" height="780" rx="20" fill="#FFFFFF" stroke="#D9572B" stroke-width="4"/>
      
      <!-- Most Popular Badge -->
      <rect x="0" y="0" width="295" height="48" rx="16" fill="#D9572B"/>
      <rect x="0" y="30" width="295" height="18" fill="#D9572B"/>
      <text x="147" y="32" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#FFFFFF" text-anchor="middle">MOST POPULAR</text>

      <text x="147" y="100" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="#D9572B" text-anchor="middle">Duo Pack</text>
      <text x="147" y="170" font-family="system-ui, sans-serif" font-weight="900" font-size="52" fill="#D9572B" text-anchor="middle">₹1,399</text>
      <text x="147" y="210" font-family="system-ui, sans-serif" font-weight="500" font-size="22" fill="#9CA3AF" text-decoration="line-through" text-anchor="middle">₹1,598</text>
      <line x1="30" y1="250" x2="265" y2="250" stroke="#FBD5C5" stroke-width="2"/>

      <text x="35" y="310" font-family="system-ui, sans-serif" font-weight="600" font-size="22" fill="#2A140B">✓ 2 Serums (60 ml)</text>
      <text x="35" y="370" font-family="system-ui, sans-serif" font-weight="600" font-size="22" fill="#2A140B">✓ Free Express Shipping</text>
      <text x="35" y="430" font-family="system-ui, sans-serif" font-weight="700" font-size="22" fill="#16A34A">✓ Save ₹199</text>
    </g>

    <!-- Tier 3: Complete Kit -->
    <g transform="translate(640, 40)">
      <rect width="295" height="740" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
      <text x="147" y="60" font-family="system-ui, sans-serif" font-weight="700" font-size="30" fill="#2A140B" text-anchor="middle">Full Kit</text>
      <text x="147" y="130" font-family="system-ui, sans-serif" font-weight="900" font-size="48" fill="#2A140B" text-anchor="middle">₹2,499</text>
      <text x="147" y="170" font-family="system-ui, sans-serif" font-weight="500" font-size="22" fill="#9CA3AF" text-decoration="line-through" text-anchor="middle">₹2,996</text>
      <line x1="30" y1="210" x2="265" y2="210" stroke="#F1F5F9" stroke-width="2"/>

      <text x="40" y="270" font-family="system-ui, sans-serif" font-size="22" fill="#2A140B">✓ Serum + SPF 50</text>
      <text x="40" y="330" font-family="system-ui, sans-serif" font-size="22" fill="#2A140B">✓ Free Jade Face Roller</text>
    </g>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Shop Now →</text>
  </g>
</svg>`,
    },
  ],
  local_and_lead_generation: [
    {
      slug: "23_lead_magnet_ebook",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="book_shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="8" dy="16" stdDeviation="20" flood-color="#000" flood-opacity="0.15"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#FFF5EE"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#D9572B">Free Skincare Guide</text>
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#2A140B">Build a routine</text>
  <text x="72" y="260" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#D9572B">that works.</text>

  <!-- Left: Bullet Benefits -->
  <g transform="translate(72, 360)">
    <text x="0" y="40" font-family="system-ui, sans-serif" font-weight="700" font-size="36" fill="#2A140B">What's inside:</text>
    
    <g transform="translate(0, 80)">
      <circle cx="20" cy="20" r="16" fill="#D9572B"/>
      <text x="20" y="26" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#FFFFFF" text-anchor="middle">✓</text>
      <text x="56" y="27" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#2A140B">Identify your skin type in 2 min</text>
    </g>

    <g transform="translate(0, 160)">
      <circle cx="20" cy="20" r="16" fill="#D9572B"/>
      <text x="20" y="26" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#FFFFFF" text-anchor="middle">✓</text>
      <text x="56" y="27" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#2A140B">Which actives pair (and which fight)</text>
    </g>

    <g transform="translate(0, 240)">
      <circle cx="20" cy="20" r="16" fill="#D9572B"/>
      <text x="20" y="26" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#FFFFFF" text-anchor="middle">✓</text>
      <text x="56" y="27" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#2A140B">AM/PM routines for Indian humidity</text>
    </g>

    <g transform="translate(0, 320)">
      <circle cx="20" cy="20" r="16" fill="#D9572B"/>
      <text x="20" y="26" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#FFFFFF" text-anchor="middle">✓</text>
      <text x="56" y="27" font-family="system-ui, sans-serif" font-weight="600" font-size="28" fill="#2A140B">Ingredient blacklist for acne</text>
    </g>
  </g>

  <!-- Right: 3D E-Book Cover Mockup -->
  <g transform="translate(640, 340)" filter="url(#book_shadow)">
    <!-- Book spine & body -->
    <rect width="360" height="480" rx="12" fill="#D9572B"/>
    <rect x="0" y="0" width="30" height="480" rx="12" fill="#B84218"/>
    <rect x="25" y="0" width="5" height="480" fill="#000000" opacity="0.2"/>

    <text x="195" y="100" font-family="system-ui, sans-serif" font-weight="800" font-size="26" fill="#FFFFFF" text-anchor="middle">GLOWVEDA GUIDE</text>
    <text x="195" y="180" font-family="system-ui, sans-serif" font-weight="900" font-size="44" fill="#FFFFFF" text-anchor="middle">The 3-Step</text>
    <text x="195" y="235" font-family="system-ui, sans-serif" font-weight="900" font-size="44" fill="#F2B544" text-anchor="middle">Glow Plan</text>
    
    <text x="195" y="420" font-family="system-ui, sans-serif" font-weight="600" font-size="20" fill="#FFFFFF" opacity="0.8" text-anchor="middle">FREE PDF DOWNLOAD</text>
  </g>

  <!-- Free Badge Starburst -->
  <g transform="translate(930, 320)">
    <circle cx="0" cy="0" r="54" fill="#F2B544"/>
    <text x="0" y="10" font-family="system-ui, sans-serif" font-weight="900" font-size="30" fill="#2A140B" text-anchor="middle">FREE</text>
  </g>

  <!-- CTA -->
  <g transform="translate(72, 1080)">
    <rect width="440" height="96" rx="48" fill="#D9572B"/>
    <text x="220" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Download Free PDF →</text>
  </g>
</svg>`,
    },
    {
      slug: "26_local_store_card",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="card_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#000" flood-opacity="0.14"/>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="#2A140B"/>

  <text x="72" y="90" font-family="system-ui, sans-serif" font-weight="600" font-size="32" fill="#F2B544">Now Open in Pune</text>
  <text x="72" y="180" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#FFFFFF"><tspan fill="#F2B544">Try before</tspan></text>
  <text x="72" y="260" font-family="system-ui, sans-serif" font-weight="800" font-size="76" fill="#FFFFFF">you buy.</text>

  <!-- Storefront Photo Placeholder -->
  <g transform="translate(72, 320)">
    <rect width="936" height="480" rx="24" fill="#3A1A0E" stroke="#6B5249" stroke-width="2"/>
    <text x="468" y="250" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFF5EE" opacity="0.6" text-anchor="middle">[High-Street Storefront Exterior Photo]</text>
  </g>

  <!-- Floating White Store Address Card -->
  <g transform="translate(72, 840)" filter="url(#card_shadow)">
    <rect width="936" height="260" rx="24" fill="#FFFFFF"/>

    <!-- Red Location Pin -->
    <circle cx="90" cy="90" r="32" fill="#FEE2E2"/>
    <text x="90" y="102" font-family="system-ui, sans-serif" font-size="36" fill="#DC2626" text-anchor="middle">📍</text>

    <!-- Address & Details -->
    <text x="150" y="80" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="#2A140B">Glowveda Experience Boutique</text>
    <text x="150" y="125" font-family="system-ui, sans-serif" font-weight="500" font-size="26" fill="#6B5249">Shop 4, FC Road, Shivaji Nagar, Pune</text>
    <text x="150" y="168" font-family="system-ui, sans-serif" font-weight="500" font-size="24" fill="#059669">● Open Daily · 11:00 AM – 9:00 PM</text>
    <text x="150" y="208" font-family="system-ui, sans-serif" font-weight="600" font-size="22" fill="#D9572B">Free personalized skin analysis at store counter</text>
  </g>

  <!-- CTA -->
  <g transform="translate(360, 1170)">
    <rect width="360" height="96" rx="48" fill="#D9572B"/>
    <text x="180" y="58" font-family="system-ui, sans-serif" font-weight="600" font-size="36" fill="#FFFFFF" text-anchor="middle">Get Directions →</text>
  </g>
</svg>`,
    },
    {
      slug: "27_festive_poster",
      prompt: `Here is the svg:
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gold_grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FDE047"/>
      <stop offset="50%" stop-color="#F2B544"/>
      <stop offset="100%" stop-color="#CA8A04"/>
    </linearGradient>
    <radialGradient id="diya_glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FDE047" stop-opacity="0.8"/>
      <stop offset="40%" stop-color="#F2B544" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#CA8A04" stop-opacity="0"/>
    </radialGradient>
    <filter id="festive_shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Deep Festive Dark Maroon Background -->
  <rect width="1080" height="1350" fill="#2A0808"/>

  <!-- Top Shop Badge -->
  <g transform="translate(360, 60)">
    <rect width="360" height="54" rx="27" fill="#3D0C0C" stroke="#F2B544" stroke-width="2"/>
    <text x="180" y="36" font-family="system-ui, sans-serif" font-weight="700" font-size="22" fill="#F2B544" text-anchor="middle" letter-spacing="2">GLOWVEDA WELLNESS</text>
  </g>

  <!-- Grand Greeting Title -->
  <text x="540" y="200" font-family="system-ui, sans-serif" font-weight="900" font-size="88" fill="url(#gold_grad)" text-anchor="middle" letter-spacing="3">HAPPY DIWALI</text>
  
  <!-- Blessing Subtitle -->
  <text x="540" y="270" font-family="system-ui, sans-serif" font-weight="500" font-size="30" fill="#FDE047" text-anchor="middle">
    "May this festival of lights illuminate your life with health, joy &amp; prosperity"
  </text>

  <!-- Festive Centerpiece Card with Diya Motif -->
  <g transform="translate(90, 340)" filter="url(#festive_shadow)">
    <!-- Ornate Frame -->
    <rect width="900" height="740" rx="28" fill="#3D0C0C" stroke="url(#gold_grad)" stroke-width="3"/>
    <rect x="16" y="16" width="868" height="708" rx="20" fill="none" stroke="#F2B544" stroke-width="1" stroke-dasharray="8 6" opacity="0.6"/>

    <!-- Glowing Diya Illustration -->
    <circle cx="450" cy="190" r="130" fill="url(#diya_glow)"/>
    
    <!-- Base Bowl -->
    <path d="M370,210 C370,260 410,280 450,280 C490,280 530,260 530,210 Z" fill="#D97706"/>
    <ellipse cx="450" cy="210" rx="80" ry="16" fill="#F2B544"/>
    <ellipse cx="450" cy="210" rx="60" ry="10" fill="#92400E"/>
    
    <!-- Flame Outer -->
    <path d="M450,115 C430,160 418,180 418,200 C418,220 432,230 450,230 C468,230 482,220 482,200 C482,180 470,160 450,115 Z" fill="#F59E0B"/>
    <!-- Flame Inner -->
    <path d="M450,140 C440,170 432,185 432,200 C432,215 440,222 450,222 C460,222 468,215 468,200 C468,185 460,170 450,140 Z" fill="#FEF08A"/>
    <ellipse cx="450" cy="202" rx="8" ry="14" fill="#FFFFFF"/>

    <!-- Festive Offer Text -->
    <text x="450" y="360" font-family="system-ui, sans-serif" font-weight="900" font-size="44" fill="#FFFFFF" text-anchor="middle" letter-spacing="2">FESTIVE GIFTING EDIT</text>
    <text x="450" y="420" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#F2B544" text-anchor="middle">FLAT 25% OFF AYURVEDIC WELLNESS HAMPERS</text>
    <text x="450" y="475" font-family="system-ui, sans-serif" font-weight="400" font-size="24" fill="#E2E8F0" text-anchor="middle">Kumkumadi Glow Elixirs · Cold-Pressed Botanicals · Ubtan Polishes</text>
    
    <!-- Code Pill -->
    <rect x="270" y="530" width="360" height="72" rx="36" fill="url(#gold_grad)"/>
    <text x="450" y="577" font-family="system-ui, sans-serif" font-weight="900" font-size="28" fill="#2A0808" text-anchor="middle" letter-spacing="1">USE CODE: DIWALI25</text>

    <!-- Urgency Subnote -->
    <text x="450" y="655" font-family="system-ui, sans-serif" font-weight="500" font-size="22" fill="#FDE047" opacity="0.9" text-anchor="middle">✦ Complimentary Luxury Gift Box with Every Order ✦</text>
  </g>

  <!-- Dark Footer with Owner Info -->
  <g transform="translate(0, 1150)">
    <rect width="1080" height="200" fill="#1A0404"/>
    <line x1="0" y1="0" x2="1080" y2="0" stroke="url(#gold_grad)" stroke-width="4"/>

    <text x="72" y="75" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="#F2B544">Dr. Rajesh Sharma</text>
    <text x="72" y="118" font-family="system-ui, sans-serif" font-weight="500" font-size="24" fill="#A8A29E">Founder &amp; Chief Formulator</text>
    <text x="72" y="158" font-family="system-ui, sans-serif" font-weight="600" font-size="24" fill="#FDE047">📞 +91 98765 43210</text>

    <text x="1008" y="90" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#FFFFFF" text-anchor="end">FC Road, Pune</text>
    <text x="1008" y="135" font-family="system-ui, sans-serif" font-weight="500" font-size="22" fill="#A8A29E" text-anchor="end">Visit Our Boutique · Open 7 Days</text>
  </g>
</svg>`,
    },
  ],
};
