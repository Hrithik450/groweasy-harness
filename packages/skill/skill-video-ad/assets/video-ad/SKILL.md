---
name: video-ad
description: "Senior generative video director that architects high-converting Meta Talking Head and B-Roll video ads, character generation blueprints, motion prompt orchestration, voice persona selection, and composite post-production assembly."
---

## Rules

- **Intake first:** pull brand context from `fetchBusinessProfile` or the brief, plus prior competitive findings from `fetchCompetitorResearches` when the script should answer a rival's winning angle; research only competitors not yet covered and save anything new back to that history. Confirm Talking Head (native synchronized speech) vs B-Roll (continuous voiceover) and 15s, 20s, 30s, or custom. Then run the 4 stages in order: script, stills, motion, assembly.
- **Word budget:** ~2.5 words/sec (measured on a production 20s spot: 50 spoken words). Per clip: 4s ≈ 9–11 words, 5s ≈ 12–13, 6s ≈ 15. Totals: 15s ≈ 38 words, 20s ≈ 50, 30s ≈ 75. Spoken hook completes within 3–4s (≈5–9 words); on-screen hook is ≤ 7 words.
- **PNG only:** save and reference every anchor still and source frame as `.png`. Never pass `.webp` URLs to motion tools; `.webp` is an ephemeral conversion for inspecting images with `readImages`.
- **Lowercase subtitles:** every burned-in `.ass` cue is lowercase. Never capitalize. Hold 3–5 words per cue so captions stay readable on mobile.
- **Attachment delivery only:** the final `.mp4` is stored with `storage: "artifact"` and delivered in a `<ui-block>` `Video` using the `/api/attachments/<attachmentId>` URL the tool returned. No remote URLs, no markdown video links.
- Mark every intermediate (stills, shot clips, voice takes) `storage: "tmp"`. Every asset is a reference you pass forward — the `/api/attachments/<attachmentId>` URL the tool returned, or its `sha256:<hex>` id. Never construct a path.
- Archetypes are quality benchmarks: adapt them to the brief, but reject cartoons, cluttered crops, and static slideshows.

## Clarifications

Ask via `<ui-action>` only when the answer is not already in context or the brief:

- Ad format (Talking Head vs B-Roll) and target duration (`15s`, `20s`, `30s`, `Other`).
- Talking Head: presenter gender, age bracket, industry attire, and office/studio setting.
- Voice: target language and regional accent; present 3–4 preview candidates.
- Brand identity, hook angle, offer, CTA destination URL, and contact details for the end card.

## Guardrails

- **9:16 only:** `1080x1920` vertical for Reels, Stories, and Facebook Video.
- **Safe zones:** keep the top 14% and bottom 20% empty on every still and clip for UI headers, action handles, captions, and hook overlays.
- **No B-Roll approval gate:** generate cutaway stills directly from the approved script beats. Reserve still approval for Talking Head presenters.
- **Presenter realism:** photorealistic humans only — no 3D, cartoons, anime, or caricatures. Frame waist/chest up on an 85mm lens with natural skin texture, clean depth of field, and demographics that match the target market.
- **Phonetic speech:** spell names and unusual terms phonetically in speech prompts (e.g. "Grow Easy", "per square foot", "b-h-k") while keeping subtitles spelled correctly.

## Execution Workflow

### Stage 1 — Angle, script, shot breakdown
- Pick one angle: pain/problem, direct benefit, social proof, objection handling, or urgency.
- Set clip count: 15s → 3–4 clips, 20s → 4–5 clips, 30s → 6–8 clips; each clip is 4–6s.
- Enforce ~2.5 words/sec: 15s ≈ 38 words, 20s ≈ 50, 30s ≈ 75. Per clip: 4s ≈ 9–11 words, 5s ≈ 12–13, 6s ≈ 15. Spoken hook completes by 4s; on-screen hook ≤ 7 words.
- Present the shot-by-shot script for quick alignment before rendering.

### Stage 2 — Anchor stills (`generateImages`)
- Talking Head: generate 1–2 master presenter stills from the chosen archetype — front-on, chest/waist up, eye contact, negative space.
- B-Roll: generate one anchor still per planned beat (exterior, interior, usage, community, aerial, lifestyle).
- Save all stills as `.png` with `storage: "tmp"`; keep the returned attachment URLs.

### Stage 3 — Motion (`imageToVideo`)
- Talking Head: feed the presenter still with the talking-head motion blueprint and native speech prompt.
- B-Roll: feed each shot still with the b-roll motion blueprint.
- Save intermediate shot clips with `storage: "tmp"`; keep the returned attachment URLs.

### Stage 4 — Audio, subtitles, assembly (`generateAudio`, `renderElement`, `ffmpeg`)
- Generate timed lowercase `.ass` subtitles from the audio track.
- Render Preset 1 and Preset 2 overlays with `renderElement`.
- Concatenate or crossfade clips, normalize audio, burn subtitles and overlays, and store the final `.mp4` with `storage: "artifact"`.
- Inspect once before delivery: audio sync, subtitle readability, safe zones, and seamless transitions.

## Prompt Blueprints

### Presenter still (`generateImages`)
```text
Front-on medium close-up portrait of a real Indian {gender} presenter in their {age_group} with {hair_style} and a {expression}. Wears {attire}, standing in {setting} with warm wood accents, soft diffused daylight, and an out-of-focus background. Shot on 85mm lens, natural skin texture, subtle studio rim light, authentic professional Indian aesthetic, looking directly into the camera. Clean composition with plenty of negative space around head and shoulders. No text, no logos, no watermarks, vertical 9:16 aspect ratio.
```

### B-Roll still (`generateImages`)
```text
{shot_description}, architectural photography, 9:16 vertical aspect ratio, shot on Sony A7R V, clean framing, 8k resolution, authentic marketing quality, empty negative space on top 14% and bottom 20% for overlays, no text, no logos.
```

### Talking Head motion (`imageToVideo`)
```text
VISUAL: keep the same person, attire, and office background from the input frame.
ACTING: the presenter speaks directly to the camera with natural micro-expressions, gentle hand gestures, and confident, engaging eye contact.
CAMERA: static handheld feel with subtle micro-movements, locked framing, no sudden zooms or pans.
VOICE: clean, warm, articulate {language_accent} voice, professional and trustworthy cadence.
He/She says: "{spoken_sentence}"
```

### B-Roll motion (`imageToVideo`)
```text
VISUAL: {shot_description_context}.
MOTION: {subtle_natural_movement_e.g._gentle_breeze_curtains_swaying_water_ripples_pedestrians_walking}.
CAMERA: {slow_push_in_or_lateral_tracking_or_drone_glide}, cinematic depth of field, 24fps film look.
LIGHT: {soft_golden_hour_or_diffused_morning_light}, natural shadows.
```

### Archetypes
- `founder_expert` — early-30s founder, smart-casual navy shirt, modern office, authoritative but approachable.
- `satisfied_customer_ugc` — relatable 20s–30s customer, casual, home or cafe, peer recommendation.
- `lifestyle_creator` — stylish 20s creator, trendy wardrobe, clean studio light, high energy.
- `professional_advisor` — mid-30s–40s consultant or broker, blazer, glass facade or boardroom, trustworthy.
- `exterior_hero` — architectural arrival, glass and stone facade, landscaped drive, golden hour.
- `interior_walkthrough` — sunlit living room, double-height ceiling, premium furniture, warm ambient light.
- `usage_ritual` — hands or model using the product (serum, laptop, smart lock).
- `social_community` — family or professionals at a clubhouse, pool deck, or lounge.
- `drone_aerial` — high-angle sweep of scale, connectivity, or surrounding canopy.
- `lifestyle_deck` — sunset balcony, tea cup, skyline in soft bokeh.

## Post-Production

### Voice
- Filter `listVoiceCatalog({ language, accent, gender })` from confirmed intake.
- Present 3–4 candidates with playable previews (`/api/attachments/audios/<voice_id>.mp3`) in a `<ui-action>` (`type: "audio"`).
- B-Roll: synthesize the full narration with `generateAudio`. Talking Head: native speech comes from `imageToVideo`; if a different accent or persona is requested, extract shot audio with `ffmpeg` and convert.

### Subtitles
- Generate timed `.ass` cues from the narration audio with `createSubtitles`. Lowercase every cue.
- Styling: solid white fill `#FFFFFF` with dark navy outline `#0a1f48`.

### Overlays (`renderElement`)
- **Preset 1 — front hook card at `0.0s` for `1.2s`:** brand logo badge and stacked `{HOOK_LINE_1}` / `{HOOK_LINE_2}` on a transparent overlay (`enable='between(t,0,1.2)'`).
- **Preset 2 — branded end card for the final `2.5–3.5s`:** value-proposition headline, primary CTA pill, contact phone, and accent divider bar; crossfade in with `xfade`.

### Assembly (`ffmpeg`)
- Concatenate clips, or join sequence shots with 0.3s crossfades (`xfade`).
- Normalize dialogue to `-14 LUFS` (`loudnorm`); duck background music to `-17 dB`.
- Burn the lowercase `.ass` subtitles and composited overlays.
- Store the production-ready `.mp4` with `storage: "artifact"`, inspect once, then deliver via `<ui-block>` `Video` using its `/api/attachments/<attachmentId>` URL.
