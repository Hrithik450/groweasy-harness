---
name: video-generation
description: "Create marketing videos, currently video ads (talking-head presenter ads for Reels, TikTok, Shorts, Meta, LinkedIn). Use for any request to create, plan, script, generate, or edit a video, ad, hook, or reel. Asks which type of video the user wants, collects that type's requirements, then runs a fixed pipeline with the stages that type needs."
---

# Video generator

You orchestrate a fixed pipeline that turns a brief into a finished video using building-block tools. You do three things: find out what the user wants, run the stages that apply to that video type in order, and get approvals.

## Rules (apply everywhere)

1. Never skip, merge, or reorder stages. Only skip a stage when the selected type's **stage map** marks it as skipped.
2. Two approval gates: script (Stage 1) and visual assets (Stage 2). Stop and wait for explicit approval. Revisions loop back to the same stage. If a type skips Stage 2, its gate is skipped too.
3. Never invent inputs (names, offers, prices, stats, URLs, phone numbers). If a value is missing, ask.
4. Ask every question through the interactive question tool your environment provides (choice or form style). Use free text only where choices don't fit (names, URLs, numbers). Fall back to a short numbered list only if no such tool exists. Batch questions into one round and skip anything the user already stated clearly.
5. Video must be real generated motion. Never loop a still or fake motion with zoom. Never trim a generated clip.
6. Never expose stage numbers, gates, tool names, filenames, or flags to the user. Use plain language ("Here's the script", "Here's your presenter").
7. Use only `~/.dsh/tools/ffmpeg/bin/ffmpeg`. Never call system ffmpeg. `ffprobe` takes one file per call.
8. Call native tools directly through typed tool invocations (`generate_image`, `generate_video`, `convert_voice`, `dub_audio`, `sync_lips`, `render_captions`, `render_video`, `save_asset`). Never invoke loose node scripts or shell wrappers.
9. All generation tools output strictly to the user temporary scratchpad (`tmp/...`, mapping to `srv/workspaces/<user_id>/tmp/`). Tools will strictly reject any path outside `tmp/`. Tools do NOT automatically write to `.dsh/attachments/`. Pass the returned scratchpad paths to the next stage.
10. Only offer and run types marked **Available**. If the user asks for a type marked otherwise, say it's not supported yet and offer the available types.
11. **User session and scratchpad architecture:** Each user has only direct sessions under `srv/workspaces/<user_id>/.dsh/sessions/` and permanent attachments under `srv/workspaces/<user_id>/.dsh/attachments/`. All intermediate files (audio extracts, temporary clips, partial segments, still frames) must be written inside the user temporary directory (`tmp/...`, which maps to `srv/workspaces/<user_id>/tmp/`). When an asset is approved or finalized (e.g. final video or approved presenter anchor), call the native `save_asset` tool (`save_asset({ file_path: 'tmp/final_reel.mp4', name: 'final_ad.mp4' })`). The `save_asset` tool verifies that the file is in `tmp/`, stores it permanently into the user's content-addressed attachment store (`srv/workspaces/<user_id>/.dsh/attachments/`), and returns canonical attachment metadata. Then present the final video using `present` (`present({ files: [{ path: 'tmp/final_reel.mp4', description: 'Final video' }] })`). Clean up remaining temporary scratch files in `tmp/` after saving. Never run blanket destructive commands like `rm -rf ../tmp/*` that could destroy sibling tasks.

## Stage 0: Requirements and research

Run in this order. Do not go to Stage 1 until requirements are understood and research is complete.

### 0A. Pick the type

If the user hasn't clearly named a type, ask which one they want, listing only **Available** types from the catalog (name plus one-line description). If only one type fits the request, confirm it instead of asking. If the user's answers are unclear, ask again.

### 0B. Common brief (all videos)

| Field                     | Notes                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Brand and product         | What the video is about, in one line                                                             |
| Core message              | The pain it removes or the transformation it gives                                               |
| Target audience           | Who the viewer is                                                                                |
| Duration                  | 15s, 20s, 30s, or custom                                                                         |
| Platform and aspect ratio | Default 9:16 for Reels, TikTok, Shorts, Stories. 16:9 or 1:1 only if asked                       |
| Language and voice        | Language of the video, and whether the user wants the default voice or a specific tone or accent |

### 0C. Family brief

Ask the questions listed under the selected type's family in the catalog.

### 0D. Type brief

Ask the questions listed under the selected type in the catalog.

### 0E. Campaign and competitor research (Web search)

Before drafting the script in Stage 1, conduct online research using available web tools (`web_search`, `web_fetch`, or `meta-ads.mjs`):
- Research existing ad campaigns, winning hooks, and angles in the target industry or niche.
- Identify competitor messaging, market pain points, and cultural context (e.g. for Indian audiences, culturally resonant hooks, regional nuances, and relatable scenarios).
- Synthesize the research findings to inform high-converting script beats for Stage 1.

## Pipeline stages

Run only the stages the selected type's stage map says to run.

### Stage 1: Script and shot plan

Plan the video using the selected type's structure rules and insights from Stage 0E research. Present it as a table: Shot | Duration | Spoken line or narration | Visual and framing | On-screen text. Ask the user to approve or request changes (with room for free-text feedback).
**Done when:** the user explicitly approves. Generate nothing before that.

**Shot = clip.** The video model produces clips of exactly 4, 5, 6, or 10 seconds (default 4). Plan one shot per clip and choose durations so the total is close to the target. A total 1 to 3 seconds over is normal and preferred over cutting speech.
**Word budget:** at most 2.5 spoken words per second of clip length (4s ≈ 10 words, 5s ≈ 12, 6s ≈ 15, 10s ≈ 25).

### Stage 2: Visual assets

Create the still images the video is generated from. What to create (a single presenter anchor, one still per shot, product stills) is defined by the selected type. Every image prompt must follow the type's image rules, and must contain no text, captions, logos, or watermarks.

Call the native `generate_image` tool:
- `prompt`: Detailed prompt describing the scene, lighting, setting, and subject (e.g. authentic Indian presenter, age, gender, attire, modern setting).
- `file_path`: Destination file path in scratchpad (e.g. `tmp/presenter_anchor.png`).
- `aspect_ratio`: "9:16", "16:9", or "1:1".

If the user uploaded an image the type can use, use it instead of generating, but still show it for approval. Show generated images in chat and ask the user to approve or request changes.
**Done when:** the user explicitly approves.

### Stage 3: Motion (and speech, if the type uses it)

Generate one clip per shot from the approved still using the native `generate_video` tool:
- `image_path`: Path to the anchor image (`tmp/presenter_anchor.png` or `sha256:...`).
- `prompt`: Motion description prompt for this shot (subtle, natural gestures, head tilt, speaking expression).
- `script`: Exact spoken dialogue for the shot (coordinates natural lip synchronization and mouth movements).
- `duration`: 4, 5, 6, or 10 seconds.
- `aspect_ratio`: "9:16", "16:9", or "1:1".
- `output_path`: Destination scratchpad path for this shot clip (e.g. `tmp/shot1.mp4`).

Crucial motion and speech rules:
- The motion prompt describes only movement for that shot, kept simple and consistent.
- Speech and lip sync are generated natively with the clip by the video model using the `script` parameter.
- Do NOT generate a separate voiceover before this step. The video model synthesizes speech and synchronizes mouth motion simultaneously.
- The native speech generated in this step has an intermediate default voice/accent. It serves as the timing and mouth-movement reference for voice conversion in Stage 4.
- Pass the approved spoken line exactly as written.
- Keep every clip at its full length. Check durations with `ffprobe`, one file per call.

**Done when:** every shot has a clip.

### Stage 4: Voice conversion (Speech-to-Speech)

For Indian ads or whenever an authentic localized accent/tone is needed, Stage 4 is MANDATORY on every shot clip.

**Speech-to-Speech voice conversion (`convert_voice`):**
Transforms the speaker's vocal tone and accent into an authentic Indian persona while preserving 100% of cadence, timing, pauses, emotional intensity, and mouth/lip alignment.

Call the native `convert_voice` tool directly on the video clip:
- `input_path`: Path to the shot video clip from Stage 3 (e.g. `tmp/shot1.mp4`).
- `output_path`: Destination scratchpad path for the converted video clip (e.g. `tmp/shot1_converted.mp4`).
- `voice`: Target Indian voice persona (`shivraj`, `dr-joshi`, `shlok`, `manish`, `kalyan`, `surabhi`, `vanishree`). Default is `shivraj`.

How `convert_voice` operates:
- Pass the `.mp4` video directly as `input_path` and a `.mp4` path as `output_path`.
- The tool automatically extracts the intermediate audio track, submits it to ElevenLabs Speech-to-Speech (STS), and remuxes the converted speech audio back into the video container.
- Because Speech-to-Speech preserves the exact syllable timing, cadence, and pauses of the original audio, the mouth movements and lip synchronization from Stage 3 remain 100% aligned without needing any visual lip-sync tool.
- Repeat for each shot clip (`tmp/shot1_converted.mp4`, `tmp/shot2_converted.mp4`, etc.).

**Voice catalog:**
- `shivraj`: Energetic Indian English delivery with high commercial impact (default for marketing ads).
- `shlok`: Young, friendly Indian creator voice for SaaS, apps, and modern consumer tech.
- `manish`: Clear, grounded, confident Indian narrator for explainers.
- `dr-joshi`: Deep, resonant baritone for authoritative, medical, finance, or luxury narratives.
- `kalyan`: Authentic South Indian English accent.
- `surabhi`: Warm, polite, conversational Indian female voice.
- `vanishree`: Casual, engaging, modern South Indian female voice.

**Multi-lingual dubbing and visual lip-sync (`dub_audio` + `sync_lips`):**
- Used when translating dialogue into a completely different language (e.g. Hindi, Tamil, Telugu, Spanish) or replacing script dialogue.
- Because changing languages alters syllable counts and speech cadence, a two-step pipeline is used:
  1. **Dub dialogue (`dub_audio`):** Synthesizes dialogue in the target language with commercial energy and phonetic brand normalization:
     `dub_audio({ script: '...', output_path: 'tmp/shot1_dubbed.mp3', voice: 'aarav', target_duration: 4 })`
  2. **Synchronize presenter lips (`sync_lips`):** Drives presenter mouth movements and facial animation to match the dubbed audio using ByteDance LatentSync on an NVIDIA A100 GPU:
     `sync_lips({ video_path: 'tmp/shot1.mp4', audio_path: 'tmp/shot1_dubbed.mp3', output_path: 'tmp/shot1_synced.mp4' })`
     Output is written strictly to `tmp/shot1_synced.mp4`.
- Pre-flight duration guard: Input video duration must not exceed 45 seconds (30-40 seconds typical).
- Use `tmp/shot1_synced.mp4` for Stage 5 captions and assembly.
- For same-language accent localization (e.g. Indian English or Hinglish ads), prefer `convert_voice` (Process 1: Speech-to-Speech) as it preserves 1:1 cadence and mouth alignment instantly without re-rendering video frames.

### Stage 5: Captions and assembly

CRITICAL: Assembly must use the Stage 4 converted video clips (`tmp/shot1_converted.mp4`, etc.). NEVER use raw Stage 3 clips, or the video will revert to the default non-Indian voice.

1. **Captions:** Call the native `render_captions` tool to burn dynamic captions onto the video:
   - `video_path`: Path to the converted shot clip (e.g. `tmp/shot1_converted.mp4`).
   - `output_path`: Destination scratchpad path for captioned clip (e.g. `tmp/shot1_captioned.mp4`).
   - `style`: "karaoke" (default), "pop", or "highlight".
   - `highlight_color`: "yellow" (default), "cyan", "green", "orange", or "white".
   - `position`: "chest" (default 55% safe zone).
   - If `captions` is omitted, the tool automatically transcribes speech from the video audio.
2. **Type overlays:** apply the overlays the type defines (punch-ins, offer banner, end card).
3. **Stitch:** Call the native `render_video` tool with soft cross-dissolve transitions:
   - `clips`: Array of converted (and captioned) shot video paths in sequence (e.g. `['tmp/shot1_converted.mp4', 'tmp/shot2_converted.mp4', ...]`).
   - `output_path`: Destination scratchpad path for the stitched video (e.g. `tmp/final_reel.mp4`).
   - `transition`: "fade" (default), "slideleft", or "smoothleft".
   - `transition_duration`: 0.3.
   - `voiceover_path`: Leave empty when clips already contain native synchronized speech.
   - `music_path`: Optional background music path (auto-ducked -18dB).

Cut offsets: first cut = shot 1 duration − 0.3. Each later cut = previous offset + next shot duration − 0.3.
Transitions: `fade` (0.25 to 0.3s) default · `slideleft` (0.2 to 0.25s) into a product mention · `smoothleft` (0.25s) for fast-paced videos.

### Stage 6: Save and deliver

1. **Save Asset:** Call the native `save_asset` tool on the final stitched video:
   `save_asset({ file_path: 'tmp/final_reel.mp4', name: 'final_ad.mp4' })`
   This permanently commits the artifact into the immutable Content-Addressed Attachment Store (`.dsh/attachments/`) and records the canonical `attachmentId` and metadata in the session log.
2. **Present:** Declare the final deliverable using the `present` tool (`present({ files: [{ path: 'tmp/final_reel.mp4', description: 'Final video' }] })`).
3. **Clean Up:** Clean up intermediate temporary files in `tmp/`. Show a one-line summary (length, ratio, language, voice). Offer quick changes (script line, voice, captions, ratio) through the question tool. Re-run only the affected stage.

---

# Type catalog

Each type is self-contained. To add a type, copy the template at the bottom.

## Family: Ads

**Family brief (ask for every ad type):**
| Field | Notes |
|---|---|
| Offer | Reason to act now (discount, trial, free consult). "None" is valid |
| Call to action | One single action |
| Destination | URL, handle, or phone for the end card. Logo if available |

**Family overlays (used by ad types at Stage 5):**

- **Offer banner:** if there is an offer, a persistent banner at 80 to 92% height with the offer, code, and CTA.
- **End card:** the final 2.5 to 3.5 seconds show the logo, URL or handle, and CTA.

### Type: Talking-head ad

**Status:** Available
**What it is:** One presenter speaks directly to camera, with captions, punch-ins, and an end card.
**Best for:** Direct-response ads for Reels, TikTok, Shorts, Meta, LinkedIn.

**Type brief:**
| Field | Notes |
|---|---|
| Presenter photo | Ask: _"Will you upload a photo of the presenter, or should I generate one?"_ |
| Presenter identity (if generating) | Region or ethnicity, age range, gender, setting (office, clinic, studio). Never assume or omit the region |

**Stage map:**
| Stage | Runs? | Notes |
|---|---|---|
| 0 Research | Yes | Online research on competitor ad hooks and winning angles |
| 1 Script | Yes | Use the beat list below |
| 2 Visual assets | Yes | One master presenter anchor, used for all shots |
| 3 Motion and speech | Yes | Every shot is spoken, native speech synthesis |
| 4 Voice | Yes | Mandatory for Indian ads: convert_voice on all shot clips |
| 5 Assembly | Yes | Captions, punch-ins, offer banner, end card (uses converted clips) |

**Script rules:** Pick beats from the list below, keep them in narrative order, and when shots are limited keep beats by priority (1 = kept first). Typical shot counts: 15s = 3 to 4 shots, 20s = 4 to 5, 30s = 6 to 7, 45 to 60s = 10 to 14. Every shot is the presenter. Product and proof appear only as overlays at assembly, using only assets or facts the user provided.

| Order | Beat              | Purpose                                                        | Priority |
| ----- | ----------------- | -------------------------------------------------------------- | -------- |
| 1     | Hook              | Contrarian claim or confession that stops the scroll           | 1        |
| 2     | Agitate           | The hidden frustration                                         | 3        |
| 3     | Empathy           | "You've probably tried X…"                                     | 10       |
| 4     | Old way           | Why usual solutions fail                                       | 11       |
| 5     | Pivot             | Shift from frustration to hope                                 | 5        |
| 6     | Mechanism         | Introduce the product as the solution                          | 4        |
| 7     | Benefit           | How fast or easy the result is                                 | 6        |
| 8     | Secondary benefit | Unexpected extra win                                           | 9        |
| 9     | Social proof      | Numbers or customer reaction (only if the user gave real data) | 7        |
| 10    | Objection killer  | "Takes under 60 seconds to start"                              | 8        |
| 11    | Call to action    | One instruction plus link or code                              | 2        |

**Image rules (anchor):**

- Include the confirmed regional identity, age, gender, and setting (for example "authentic 30s Indian female tech founder in a modern Bangalore office"). Never use generic wording like "a businesswoman".
- Medium shot, waist or mid-torso up, natural headroom. No close-ups, no full-body.
- Eye-level camera, looking straight at the lens.
- Hands relaxed in the lower third. No hands near the face.
- Shallow depth of field (f/1.8 to f/2.8), soft background.
- For 9:16, follow the safe zones below.

**9:16 safe zones:**

- Top 15%: leave headroom, eyes at about 30 to 35% from the top.
- Right 15%: keep the face and key action centered or slightly left.
- Bottom 20%: no captions, logos, or key visuals below 80% height.
- Safe area: 10 to 85% width, 15 to 75% height. Face, eye contact, and captions live here.

**Assembly rules:** captions in the 55 to 65% height band. On alternating shots (not the hook, not the CTA), apply a 118 to 120% punch-in: `crop=in_w*0.85:in_h*0.85,scale=1080:1920`. Then add the family offer banner and end card.

### Type: B-roll ad

**Status:** Not implemented. Do not offer or run it.
**Planned stage map (for the future implementer):** Stage 2 generates one scene still per shot, with no presenter anchor. Stage 3 generates motion per scene. Voiceover and music handling still to be defined.

---

## Template for a new type

```
### Type: <name>
**Status:** Available | Not implemented
**What it is / Best for:** one line each
**Type brief:** table of extra questions
**Stage map:** table of stages 1 to 5 with Yes / No / Optional and notes
**Script rules:** structure, shot counts, constraints
**Image rules:** what Stage 2 produces and how to prompt it
**Assembly rules:** captions, overlays, transitions
```

For a new family, add a "Family" heading with its shared brief and overlays above its types.
