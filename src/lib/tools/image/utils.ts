export const IMAGE_TYPES_SLUG = [
  "pain_and_problem",
  "transformation_and_lifestyle",
  "product_and_ecommerce",
  "native_and_social",
  "local_and_brand_authenticity",
  "festive_and_retail_posters",
] as const;

export type ImageTypeSlug = (typeof IMAGE_TYPES_SLUG)[number];

export interface ImageCluster {
  slug: ImageTypeSlug;
  description: string;
  examples: string;
}

export const imageClusters: ImageCluster[] = [
  {
    slug: "pain_and_problem",
    description:
      "Top-of-funnel customer pain points, dropped calls, cold leads, manual workflow frustrations, and before/old-way struggles.",
    examples:
      "1) Frustrated telecaller holding forehead after a dropped call in a busy office; 2) Exhausted broker late at night surrounded by chaotic paper registers and unread chats.",
  },
  {
    slug: "transformation_and_lifestyle",
    description:
      "Happy transformed customers, active product usage rituals, glowing natural skin, and atmospheric situational work/mood scenes.",
    examples:
      "1) Smiling entrepreneur leaning back with coffee as qualified leads ping automatically; 2) Young woman with glowing natural skin applying face serum in a sunlit bathroom.",
  },
  {
    slug: "product_and_ecommerce",
    description:
      "E-commerce product packshots on pedestals, architectural property heroes, and top-down flat lay unboxing / bundle spreads.",
    examples:
      "1) Amber dropper serum bottle on a soft peach stone pedestal with fresh orange slices; 2) Top-down flat lay unboxing spread of an open gift box, cosmetic bottles, and botanicals.",
  },
  {
    slug: "native_and_social",
    description:
      "Native UGC smartphone photos with domestic realism and grain, plus relatable reaction memes.",
    examples:
      "1) Casual tilted smartphone mirror selfie holding a moisturiser with real bathroom counter clutter; 2) Candid relatable reaction of a person dramatically facepalming at their laptop.",
  },
  {
    slug: "local_and_brand_authenticity",
    description:
      "High-street store exteriors with blank signboards, founder formulation lab/workshop stories, and transparent owner cutouts.",
    examples:
      "1) Modern boutique storefront on a high street at dusk with warm interior lights and blank signboard; 2) Founder in a white lab coat smiling inside a formulation lab with beakers and botanicals.",
  },
  {
    slug: "festive_and_retail_posters",
    description:
      "Local shop product posters and festival greetings with cultural motifs, traditional props, and soft bokeh.",
    examples:
      "1) Diwali festive background with glowing brass diyas and marigolds leaving upper third clear for title; 2) Festive sweet shop display of fresh kaju katli and laddus arranged in brass thalis.",
  },
];

export interface ImagePrompt {
  slug: string;
  prompt: string;
}

export const imagePrompts: Record<ImageTypeSlug, ImagePrompt[]> = {
  pain_and_problem: [
    {
      slug: "pain_moment",
      prompt:
        "Use for: Customer pain point hook (dropped calls, cold leads, messy manual workflows). Layout: hero_photo. Aspect ratio: 9:16 (1520x2688), 2k resolution. Subject placement: Lower half and {subject_side} side of the frame; upper 40% must remain a calm, softly blurred {bg_palette} background with plenty of empty space for headline overlays. Template: Photorealistic vertical photo, editorial advertising style. A {persona_age_gender} {persona_role} {setting_detail}, {pain_action}; {pain_emotion}. {pain_cause_context}. The subject is in the lower half and {subject_side} side of the frame; the upper 40 percent of the image is a calm, softly blurred {bg_palette} background with plenty of empty space. {lighting}, shallow depth of field, {brand_palette_words} colour palette. Absolutely no text, no letters, no numbers, no logos, no signage, no watermark, no screens facing the camera, no user interface anywhere in the image.",
    },
    {
      slug: "before_old_way",
      prompt:
        "Use for: Left/top panel of a before-vs-after comparison. Desaturated cool tones displaying struggle with outdated methods. Layout: before_after. Aspect ratio: 9:16 (1520x2688) or 4:5, 2k resolution. Subject placement: Subject centred, medium shot, waist up. Dim flat fluorescent light. Template: Photorealistic vertical photo, slightly desaturated and cool grey tones. A {persona_age_gender} {persona_role} {old_way_setting} with {old_tool_object}, looking {negative_emotion}, {negative_gesture}. Dim flat fluorescent light. Subject centred, medium shot, waist up. Absolutely no text, no letters, no numbers, no logos, no signage, no watermark, no screens facing the camera, no user interface anywhere in the image.",
    },
  ],

  transformation_and_lifestyle: [
    {
      slug: "after_happy_customer",
      prompt:
        "Use for: Right/bottom panel of before-vs-after, or standalone happy customer hero. Pair with before_old_way using the same persona. Layout: before_after or hero_photo. Aspect ratio: 9:16 (1520x2688) or 4:5, 2k resolution. Subject placement: Subject centred, medium shot, waist up. Soft daylight, relaxed posture. Template: Photorealistic vertical photo, bright and fresh. A {persona_age_gender} {persona_role} {new_way_setting}, {positive_action}, relaxed posture. Soft daylight, {brand_palette_words} tones, shallow depth of field. Subject centred, medium shot, waist up. Absolutely no text, no letters, no numbers, no logos, no signage, no watermark, no screens facing the camera, no user interface anywhere in the image.",
    },
    {
      slug: "model_using_product",
      prompt:
        "Use for: Lifestyle person-with-product in active usage ritual, or testimonial/review avatars. Layout: lifestyle or testimonial. Aspect ratio: 9:16 (1520x2688) or 4:5, 2k resolution. Subject placement: Lower 60% and slightly {side} of the frame; upper 40% is softly blurred {bg} with plenty of empty space for copy. Template: Photorealistic vertical lifestyle photo. A {persona_age_gender} with {persona_detail}, wearing {outfit}, {using_action} {product_described_without_brand_text} in {setting} with {light}. {Pronoun} is in the lower 60 percent and slightly {side} of the frame; the upper 40 percent is softly blurred {bg} with plenty of empty space. Natural skin texture, {palette} palette. Absolutely no text, no letters, no numbers, no logos, no signage, no watermark, no screens facing the camera, no user interface anywhere in the image.",
    },
    {
      slug: "scene_environment",
      prompt:
        "Use for: Situational or atmospheric mood hook (night shift, busy site visit, rush-hour kitchen). Layout: hero_photo. Aspect ratio: 9:16 (1520x2688), 2k resolution. Subject placement: Subject in lower half; upper 45% is {empty_zone_description} with plenty of empty space for dark/light headline scrims. Template: Photorealistic vertical photo, {mood} mood. A {persona_age_gender} {persona_role} {activity} in {location}, {positive_or_busy_expression}, {key_props}. Behind {pronoun}, {background_scene} in {bg_palette}. {Pronoun} is in the lower half of the frame; the upper 45 percent is {empty_zone_description} with plenty of empty space. Absolutely no text, no letters, no numbers, no logos, no signage, no watermark, no screens facing the camera, no user interface anywhere in the image.",
    },
  ],

  product_and_ecommerce: [
    {
      slug: "product_packshot",
      prompt:
        "Use for: Clean e-commerce hero, discount offers, product announcements, and ingredient callouts. Layout: product_hero, offer, announcement, or callouts. Aspect ratio: 4:5 (1792x2240), 2k resolution. Subject placement: Product in lower-centre; upper 40% is plain seamless {bg_colour} background for a title. Template: Premium product packshot photo of {product_described_without_brand_text} {packaging_detail}, standing on {surface_or_pedestal}, {props_signalling_benefit} beside it, soft studio light with gentle shadow, clean seamless {bg_colour} background. Product in the lower-centre of the frame; the upper 40 percent is plain empty {bg_colour} background for a title. Photorealistic, e-commerce hero shot. Absolutely no text, no letters, no numbers, no logos, no signage, no watermark, no screens facing the camera, no user interface anywhere in the image.",
    },
    {
      slug: "product_environment_hero",
      prompt:
        "Use for: High-rise real estate, property development, or storefront shown inside mock social ad cards. Layout: product_hero or card frame. Aspect ratio: 4:5 (1792x2240), 2k resolution. Subject placement: Lower 65% with clean sky/background on top. Template: Photorealistic {photo_genre} photo of {product_or_place} {key_features_visual} at {time_of_day}, clean {background}, premium {category} marketing look. Absolutely no text, no letters, no numbers, no logos, no signage, no watermark, no screens facing the camera, no user interface anywhere in the image.",
    },
    {
      slug: "flat_lay_unboxing",
      prompt:
        "Use for: Unboxing experience, bundles, BOGO deals, giveaway prizes, and countdown backgrounds. Layout: offer, countdown, or giveaway. Aspect ratio: 4:5 (1792x2240), 2k resolution. Subject placement: Neatly arranged in centre; generous empty space across the top 35% of the frame. Template: Top-down flat lay photo on a {bg_colour} {surface} background: {hero_product} in the centre, {packaging_open_box}, {complementary_items}, {ingredient_props}. Neatly arranged with generous empty space at the top 35 percent of the frame. Soft even daylight, photorealistic, premium unboxing aesthetic. Absolutely no text, no letters, no numbers, no logos, no cards with writing, no watermark anywhere in the image.",
    },
  ],

  native_and_social: [
    {
      slug: "ugc_phone_photo",
      prompt:
        "Use for: Native UGC-style feed and stories ads mimicking real user phone photos. Layout: ugc. Aspect ratio: 9:16 (1520x2688), 2k resolution. Subject placement: Casual amateur tilt in lower-middle; upper third is {plain_area} with empty space. Template: Casual amateur smartphone photo, slightly tilted, natural imperfect framing: {hand_or_person} {holding_or_using} {product} {where_in_real_home}, {everyday_clutter}, {indoor_light}, a little grain, authentic user-generated content look, not a studio shot. Upper third is {plain_area} with empty space. Absolutely no text, no letters, no numbers, no logos, no signage, no watermark, no screens facing the camera, no user interface anywhere in the image.",
    },
    {
      slug: "meme_reaction",
      prompt:
        "Use for: Meme ad background featuring an exaggerated, relatable human reaction. Layout: meme. Aspect ratio: 1:1 (1080x1080) or 4:5, 1k resolution. Subject placement: Centred expressive face with clean uncluttered background; top and bottom zones left clear for code-drawn meme text bars. Template: Photorealistic {framing} photo of a {persona} with an exaggerated, relatable {reaction_emotion} expression, {gesture}, in {everyday_setting}. Expressive face clearly visible, centred, simple uncluttered background, bright even light. Absolutely no text, no letters, no numbers, no logos, no signage, no watermark, no screens facing the camera, no user interface anywhere in the image.",
    },
  ],

  local_and_brand_authenticity: [
    {
      slug: "storefront_local",
      prompt:
        "Use for: Local retail store visit, branch opening, or high-street local business marketing. Layout: local_store. Aspect ratio: 9:16 (1520x2688), 2k resolution. Subject placement: Storefront in lower 60%; upper 40% is {sky} with empty space; signboard area above entrance must remain completely blank. Template: Photorealistic vertical photo of the exterior of {store_type} on {street_context} in the {time_of_day}, warm inviting interior lights, glass front showing {interior_detail}, {entrance_detail}, a blank plain signboard area above the door with no writing. Store in the lower 60 percent; upper 40 percent is {sky} with empty space. Absolutely no text, no letters, no numbers, no logos, no signage text, no watermark anywhere in the image.",
    },
    {
      slug: "founder_bts",
      prompt:
        "Use for: Founder story, workshop, formulation lab, or kitchen behind-the-scenes authenticity. Layout: founder. Aspect ratio: 9:16 (1520x2688), 2k resolution. Subject placement: Founder in lower 60%; upper 40% is softly blurred clean wall with empty space for headline quote. Template: Photorealistic vertical behind-the-scenes photo. A friendly {persona_age_gender} founder wearing {outfit}, smiling at the camera, standing in {workplace} with {work_props}. {Pronoun} is in the lower 60 percent of the frame; the upper 40 percent is a softly blurred {bg} with empty space. Natural light, authentic, not stock-looking. Absolutely no text, no letters, no numbers, no logos, no labels with writing, no watermark anywhere in the image.",
    },
    {
      slug: "owner_cutout",
      prompt:
        "Use for: Shop owner or spokesperson isolated transparent cut-out for poster and greeting creatives. Layout: festive_poster. Aspect ratio: 2:3 (688x1024), 1k resolution, background: transparent. Subject placement: Waist-up portrait facing camera, clean alpha cutout. Template: Waist-up portrait of a {friendly_adjective} {nationality} {business_role} about {age} years old, {hair}, {distinguishing_detail}, warm smile, wearing {outfit}, {gesture} at chest, facing camera, studio lighting, photorealistic. Isolated on a fully transparent background, cut-out, no background, no text.",
    },
  ],
  festive_and_retail_posters: [
    {
      slug: "shop_product_poster",
      prompt:
        "Use for: Small-shop product poster background (jewellery, sarees, sweets, salon, retail products). Layout: festive_poster with product line. Aspect ratio: 2:3 (688x1024), 1k resolution. Subject placement: Lower 60% contains product arrangement; upper 40% is an uncluttered softly blurred {palette} background for shop name and offer. Template: Vertical {shop_category} poster background photo. Lower 60%: {hero_products_described_richly}{optional_model_person}. Upper 40% of the frame is an uncluttered softly blurred {palette} background{optional_setting}, empty space for a title. {lighting_mood}, photorealistic, premium. Absolutely no text, no letters, no logos, no watermark.",
    },
    {
      slug: "festival_poster",
      prompt:
        "Use for: Festival greeting background (Diwali, Navratri, Eid, Christmas, New Year). Layout: festive_poster. Aspect ratio: 2:3 (688x1024), 1k resolution. Subject placement: Centre-left motif with props; upper third calm backdrop for greeting title; lower right plain bokeh for owner cutout. Template: Vertical {festival} poster background. Centre-left middle: {festival_hero_motif} surrounded by {festival_props}. Upper third is a calm {palette_1} and {palette_2} {backdrop_type} backdrop with {subtle_pattern}, empty space for a title. Lower right area relatively plain {palette_1} with soft bokeh. {style}. Absolutely no text, no letters, no logos, no watermark.",
    },
  ],
};
