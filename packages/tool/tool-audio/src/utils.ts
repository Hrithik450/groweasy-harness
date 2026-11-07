export type VoiceLanguage = "Hinglish" | "English" | "Hindi" | "Kannada";

export type VoiceAccent =
  | "american"
  | "british"
  | "australian"
  | "indian"
  | "canadian"
  | "irish"
  | "african"
  | "italian"
  | "spanish";

export interface VoiceEntry {
  id: string;
  name: string;
  accent: VoiceAccent;
  description: string;
  language: VoiceLanguage;
  gender: "male" | "female";
}

export const VOICE_CATALOG: Readonly<Record<string, VoiceEntry>> = {
  "kannada-sushant-rj": {
    id: "uRYWCYlMBqH2D91pGofK",
    name: "Sushant R (RJ Style)",
    language: "Kannada",
    accent: "indian",
    gender: "male",
    description:
      "Energetic RJ & chatty promo style with natural, high-energy delivery. Perfect for upbeat radio-style promos, casual FM ads, and engaging consumer conversation.",
  },
  "kannada-sushant-anchor": {
    id: "dpt1m3zwZwMGSVaWVR5I",
    name: "Sushant R (Bold Anchor)",
    language: "Kannada",
    accent: "indian",
    gender: "male",
    description:
      "Authoritative anchor & corporate presenter with deep, commanding gravitas. Built for corporate ads, tech launches, and hard-hitting marketing campaigns.",
  },
  "kannada-kriti-friendly": {
    id: "BR93uV16h7Ff1tjw4CiG",
    name: "Kriti L",
    language: "Kannada",
    accent: "indian",
    gender: "female",
    description:
      "Warm, expressive, and conversational friend-style delivery. Makes marketing scripts feel like an authentic recommendation from a trusted friend.",
  },
  "kannada-kampana-radio": {
    id: "wgYipW6i4oMTbU78GXhZ",
    name: "Kampana",
    language: "Kannada",
    accent: "indian",
    gender: "female",
    description:
      "High-energy FM radio presenter & viral hook delivery with vibrant, punchy cadence. Ideal for festive retail offers, radio spots, and viral social video hooks.",
  },
  "kannada-sharadhi-casual": {
    id: "7B4TkucyQHy3r9hvAnhg",
    name: "Sharadhi",
    language: "Kannada",
    accent: "indian",
    gender: "female",
    description:
      "Casual, modern, and relatable creator style with authentic Bengaluru cadence. Perfect for Gen-Z/Millennial lifestyle, beauty, D2C, and companion apps.",
  },
  "kannada-priya-news": {
    id: "z5dCxveFRvWeqsaKgMqe",
    name: "Krishna Priya",
    language: "Kannada",
    accent: "indian",
    gender: "female",
    description:
      "Sharp, composed, and authoritative broadcast anchor style with crisp diction and polished precision. Excellent for BFSI, healthcare, and institutional trust campaigns.",
  },
  "kannada-kanha-narrator": {
    id: "SJug61LFJJ8qMtvYTxmS",
    name: "Kanha R",
    language: "Kannada",
    accent: "indian",
    gender: "male",
    description:
      "Rich, resonant, prestigious brand narrator with deep, textured baritone. Lends massive cinematic scale to real estate, automotive, and heritage brand commercials.",
  },
  "kannada-bharadwaj-teasing": {
    id: "75K9CAd9ZbhCXsP4nMDk",
    name: "Bharadwaj",
    language: "Kannada",
    accent: "indian",
    gender: "male",
    description:
      "Playful, teasing, chill guy style with comic timing, witty banter, and charmingly casual delivery. Perfect for comedy skits, playful D2C ads, and relatable hooks.",
  },
  "kannada-srivatsa-dramatic": {
    id: "eFpe37M0GDrRGGqkEb8P",
    name: "Srivatsa",
    language: "Kannada",
    accent: "indian",
    gender: "male",
    description:
      "Cinematic, gripping, and dramatic teaser narrator with modulated baritone. Built for suspenseful product reveals, high-drama teasers, and trailers.",
  },
  "kannada-rajaratna-hero": {
    id: "Z1sgBQe4e9WquuP9yR3D",
    name: "Rajaratna P",
    language: "Kannada",
    accent: "indian",
    gender: "male",
    description:
      "Commanding, husky, heavy commercial hero voice with weathered masculine authority. Incredible for action trailers, heavy machinery, fitness, and blockbuster promotions.",
  },
  "hindi-monika-commercial": {
    id: "f1abxvIEijusskcPWE5x",
    name: "Monika Sogam",
    language: "Hindi",
    accent: "indian",
    gender: "female",
    description:
      "Premium commercial ad & polished brand ambassador style with expressive luxury TVC delivery. Commands immediate attention with warmth and effortless prestige.",
  },
  "hindi-mitali-tagline": {
    id: "WrtO85aB57pmgtRyt83W",
    name: "Mitali",
    language: "Hindi",
    accent: "indian",
    gender: "female",
    description:
      "Punchy, dramatic ad tagline & high-josh commercial style. Bold, energetic, and built for FMCG mass-market commercials, festive sale jingles, and unforgettable taglines.",
  },
  "hindi-kangana-luxury": {
    id: "6ZAUkyboI9l33VM5oWBL",
    name: "Kangana",
    language: "Hindi",
    accent: "indian",
    gender: "female",
    description:
      "Cinematic, polished luxury & BFSI narrator style with rich, deep gravitas. Ideal for luxury jewelry, premium automotive, wealth management, and heritage brand films.",
  },
  "hindi-riya-lifestyle": {
    id: "e6h2ged6ThVk1jTnIwnC",
    name: "Riya Rao",
    language: "Hindi",
    accent: "indian",
    gender: "female",
    description:
      "Elegant, confident lifestyle & beauty creator voice. Expressive yet composed, perfect for fashion, beauty, wellness, and high-conversion D2C visual ads.",
  },
  "hindi-kanika-corporate": {
    id: "O9JAdqHcVbTPSlKPKCKh",
    name: "Kanika",
    language: "Hindi",
    accent: "indian",
    gender: "female",
    description:
      "Sharp, professional, upmarket corporate spokesperson with confident, executive tone. Perfect for tech product walkthroughs, institutional trust campaigns, and fintech ads.",
  },
  "hindi-aarav-commercial": {
    id: "x9wViLHrpGxKBhkUybpR",
    name: "Aarav R",
    language: "Hindi",
    accent: "indian",
    gender: "male",
    description:
      "Deep, resonant, and punchy marketing delivery with genuine Indian josh. Ideal for mass commercial ads, product promos, and tech launches.",
  },
  "hindi-viraj-viral": {
    id: "pHG3exaXQt8bmTWbaVOs",
    name: "Viraj",
    language: "Hinglish",
    accent: "indian",
    gender: "male",
    description:
      "High-energy, enthusiastic viral social ad hook delivery. Vibrant, fast-paced, high-voltage conversational style designed for Reels, Shorts, and bold youth promos.",
  },
  "hindi-prayan-teasing": {
    id: "ZDsEGXYAf6c4QY0LNSHr",
    name: "Prayan",
    language: "Hinglish",
    accent: "indian",
    gender: "male",
    description:
      "Quirky, teasing, playful ad creator style with comic timing, witty banter, and playful sarcasm that cuts through advertising noise on social media.",
  },
  "hindi-yatin-authoritative": {
    id: "VynqN8qbEfEZNZlVOik7",
    name: "Yatin",
    language: "Hindi",
    accent: "indian",
    gender: "male",
    description:
      "Confident, powerful, and impactful commercial delivery. Authoritative and punchy to drive urgent call-to-action in TVCs, radio ads, and FMCG promotions.",
  },
  "hindi-reyaansh-baritone": {
    id: "YWaBwjubozVSPD1RgnRa",
    name: "Reyaansh",
    language: "Hindi",
    accent: "indian",
    gender: "male",
    description:
      "Deep, authoritative, premium luxury brand narrator with rich, velvety baritone. Makes any brand sound elite, perfect for luxury cars, real estate, and legacy brands.",
  },
  "hinglish-abhishek-creator": {
    id: "0oZaNvOUQnpeHSZr7Nzi",
    name: "Abhishek",
    language: "Hinglish",
    accent: "indian",
    gender: "male",
    description:
      "Conversational tech explainer & modern creator style. Natural, warm, highly relatable Hinglish voice for YouTube Shorts, Reels, product demos, and creator storytelling.",
  },
  "hinglish-shreya-host": {
    id: "KawjuInLhxYsnVJlqveG",
    name: "Shreya G",
    language: "Hinglish",
    accent: "indian",
    gender: "female",
    description:
      "Candid show host & lifestyle podcast presenter style. Warm, easygoing Hinglish host energy blending Hindi and English for casual brand banter, vlogs, and customer interviews.",
  },
  "hinglish-apsara-raw": {
    id: "QpSjVAs2VI5btKzupPaD",
    name: "Apsara",
    language: "Hinglish",
    accent: "indian",
    gender: "female",
    description:
      "Raw, natural, unscripted authentic creator style in unfiltered Hinglish. Sounds like a real person sharing an honest consumer tip, perfect for D2C beauty and modern apps.",
  },
  "hinglish-sia-sales": {
    id: "OTiKmbPsHxZkwedBE4Cp",
    name: "Sia",
    language: "Hinglish",
    accent: "indian",
    gender: "female",
    description:
      "Engaging, polite sales & product pitch delivery in clear Hinglish. Humble yet persuasive, built for product walkthroughs, e-commerce ads, and customer conversion.",
  },
  "hinglish-rahul-story": {
    id: "K0JkRcnnqtJOP749opMo",
    name: "Rahul",
    language: "Hinglish",
    accent: "indian",
    gender: "male",
    description:
      "Seamless conversational narrator blending Hindi and English for on-camera dialogue, relatable brand films, social ads, and startup founder narratives.",
  },
  "hinglish-nimmo-care": {
    id: "zELrJnEGQSGWhiTNcUKq",
    name: "Nimmo",
    language: "Hinglish",
    accent: "indian",
    gender: "female",
    description:
      "Clear, reassuring customer guide & advisory delivery in empathetic Hinglish. Professional for enterprise services, approachable for daily consumer apps.",
  },
  shivraj: {
    id: "6OWR66phKIqiCowCgr7X",
    name: "Shivraj",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Conversational commercial delivery with energetic Indian English and high commercial josh.",
  },
  "dr-joshi": {
    id: "WkJcHHkxVUZl4ua7fWlW",
    name: "Dr. Joshi",
    language: "Hindi",
    accent: "indian",
    gender: "male",
    description:
      "Authoritative luxury narrator with deep, cinematic resonant baritone in Hindi.",
  },
  "aditya-narrator": {
    id: "BacXQCctPf5cpAQtGHQV",
    name: "Aditya",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Natural, expressive, and engaging Indian English narrator with a youthful, confident tone. Ideal for storytelling, documentaries, and brand presentations.",
  },
  "nim-commercial": {
    id: "bQnIpi9pYcG1X7IArv1Z",
    name: "Nim",
    language: "English",
    accent: "indian",
    gender: "female",
    description:
      "Warm, confident, and expressive Indian English commercial voice. Perfect for commercials, TVCs, and high-impact brand pitches.",
  },
  "rocky-tech": {
    id: "8NdlidUZHOB6WALorwRR",
    name: "Rocky",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Youthful, articulate Indian English voice with modern tech entrepreneur energy. Ideal for SaaS, startup explainers, and AI product walkthroughs.",
  },
  "sakshi-storyteller": {
    id: "YGp6JB3tCVJQLgpNjJ4Y",
    name: "Sakshi",
    language: "English",
    accent: "indian",
    gender: "female",
    description:
      "Energetic, relatable Indian English UGC creator and Reel storyteller. Feels like a friend sharing a genuine experience.",
  },
  "sami-ugc": {
    id: "A2tzGkc16Ok8n1L1rir7",
    name: "Sami",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Fast-paced, high-conversion Indian English UGC creator voice for short-form video ads, social media reviews, and TikTok/Reels.",
  },
  "chethan-story": {
    id: "dRZhhQhm9h4yO796tEow",
    name: "Chethan",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Warm, resonant, and natural Indian English narrator with emotional clarity for cinematic narratives and lifestyle brands.",
  },
  "tanvi-explainer": {
    id: "IypcXp96wNrRy8sA7wkt",
    name: "Tanvi",
    language: "English",
    accent: "indian",
    gender: "female",
    description:
      "Clear, articulate, and poised Indian English corporate voice. Ideal for product walkthroughs, onboarding videos, and fintech explainers.",
  },
  "parashar-executive": {
    id: "k5SbRQP0b6O6GyslkGBs",
    name: "Parashar",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Authentic, conversational Indian English corporate voice with executive boardroom gravitas and natural pacing.",
  },
  "manish-gadia-corporate": {
    id: "Nl7pP9F3YZREQoKMhedW",
    name: "Manish Gadia",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Mature, confident Indian English male voice in his 40s with a polished, authoritative delivery for enterprise and B2B campaigns.",
  },
  "lavkush-calm": {
    id: "fSTPf9bYe9OOsdVPpz21",
    name: "Lavkush",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Calm, warm, articulate Indian English voice with clear diction. Perfect for educational explainers, healthcare, and mindful storytelling.",
  },
  "anuj-bhatia": {
    id: "nAXOV8RqzafF7mI2EBhz",
    name: "Anuj Bhatia",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Warm, soulful storytelling with an Indian English touch that stops scrolling on social media feeds.",
  },
  "sia-corporate": {
    id: "W7iR5kTNHozpIl2Jqq15",
    name: "Sia (Corporate)",
    language: "English",
    accent: "indian",
    gender: "female",
    description:
      "Sharp, clear, and confident Indian English spokesperson for professional presentations and institutional trust.",
  },
  "viraj-natural": {
    id: "fPIfC3elMLbN9tNwMXkw",
    name: "Viraj (English)",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Natural, confident Indian English presenter with commercial charm and crisp articulation.",
  },
  "monika-natural": {
    id: "2zRM7PkgwBPiau2jvVXc",
    name: "Monika Sogam (Natural)",
    language: "English",
    accent: "indian",
    gender: "female",
    description:
      "Deep, natural Indian English voice with pleasant and polished brand ambassador delivery.",
  },
  "karan-founder": {
    id: "1pAo3XuopqND1XIDGKB4",
    name: "Karan",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Confident, authentic Indian English tech founder and commercial presenter with natural conversational pacing and high marketing conviction.",
  },
  karan: {
    id: "1pAo3XuopqND1XIDGKB4",
    name: "Karan",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Confident, authentic Indian English tech founder and commercial presenter with natural conversational pacing and high marketing conviction.",
  },
  shlok: {
    id: "2i7LhYjvw41fgbcqlf3Z",
    name: "Shlok",
    language: "Hinglish",
    accent: "indian",
    gender: "male",
    description:
      "Young, friendly, modern Indian creator style for startups and social products.",
  },
  manish: {
    id: "KSSOzt6V7IiEnDiQtnOJ",
    name: "Manish",
    language: "Hindi",
    accent: "indian",
    gender: "male",
    description:
      "Grounded narrator with confident, clear delivery for explainers and documentaries.",
  },
  kalyan: {
    id: "AdU2HL826uF30ERr4lBu",
    name: "Kalyan",
    language: "English",
    accent: "indian",
    gender: "male",
    description:
      "Authentic South Indian English delivery for localized campaigns.",
  },
  surabhi: {
    id: "ch9J8IB6HKlEHQaWQFdk",
    name: "Surabhi",
    language: "Hindi",
    accent: "indian",
    gender: "female",
    description: "Warm, polite, friendly conversational female delivery.",
  },
  vanishree: {
    id: "EQajdcMa8fccc3KCqwGO",
    name: "Vanishree",
    language: "English",
    accent: "indian",
    gender: "female",
    description:
      "Casual, modern, engaging female creator voice for social ads and creator videos.",
  },
};

export const DEFAULT_VOICE_ID = "x9wViLHrpGxKBhkUybpR";

/**
 * Validates and returns a verified ElevenLabs voice ID.
 * Accepts catalog keys (e.g. 'shivraj', 'dr-joshi', 'kalyan'), direct ElevenLabs IDs, or voice names.
 */
export function resolveVoiceId(voiceId?: string): string {
  if (!voiceId || !voiceId.trim()) {
    return DEFAULT_VOICE_ID;
  }
  const clean = voiceId.trim();
  const lower = clean.toLowerCase();

  if (VOICE_CATALOG[clean]) {
    return VOICE_CATALOG[clean].id;
  }
  if (VOICE_CATALOG[lower]) {
    return VOICE_CATALOG[lower].id;
  }

  for (const [key, entry] of Object.entries(VOICE_CATALOG)) {
    if (
      entry.id === clean ||
      key.toLowerCase() === lower ||
      entry.name.toLowerCase() === lower
    ) {
      return entry.id;
    }
  }

  if (/^[a-zA-Z0-9]{20}$/.test(clean)) {
    return clean;
  }

  return DEFAULT_VOICE_ID;
}

/**
 * Returns filtered list of canonical marketing voices.
 */
export function getVoiceCatalogList(filter?: {
  language?: string;
  gender?: string;
  accent?: string;
}): VoiceEntry[] {
  return Object.values(VOICE_CATALOG).filter((v) => {
    if (
      filter?.language &&
      filter.language !== "all" &&
      v.language.toLowerCase() !== filter.language.toLowerCase()
    ) {
      return false;
    }
    if (
      filter?.gender &&
      filter.gender !== "all" &&
      v.gender.toLowerCase() !== filter.gender.toLowerCase()
    ) {
      return false;
    }
    if (
      filter?.accent &&
      filter.accent !== "all" &&
      v.accent.toLowerCase() !== filter.accent.toLowerCase().trim()
    ) {
      return false;
    }
    return true;
  });
}
