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
8. Call native tools directly through typed tool invocations (`generate_image`, `generate_video`, `convert_voice`, `dub_audio`, `render_captions`, `render_video`). Never invoke loose node scripts or shell wrappers.
9. Every tool saves its output and returns attachment metadata. Pass the returned paths to the next stage.
10. Only offer and run types marked **Available**. If the user asks for a type marked otherwise, say it's not supported yet and offer the available types.
11. **Scratch files in user-specific `../tmp/` and deliverable presentation:** All intermediate files (audio extracts, temporary clips, partial segments) MUST strictly be written directly to the user-specific scratchpad at `../tmp/` (`workspaces/<user_id>/tmp/`) and immediately cleaned up (`rm -rf ../tmp/*`) after rendering. Native media tools automatically persist outputs directly to the content-addressed attachment store (`.dsh/attachments/`) and record attachment metadata in the session. Declare any requested workspace deliverable via the `present` tool (`present({ files: [{ path: '<output_path>', description: 'Final video' }] })`). Never call `present` on temporary files.

## Stage 0: Requirements

Run in this order. Do not go to Stage 1 until every required field is known.

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

## Pipeline stages

Run only the stages the selected type's stage map says to run.

### Stage 1: Script and shot plan

Plan the video using the selected type's structure rules. Present it as a table: Shot | Duration | Spoken line or narration | Visual and framing | On-screen text. Ask the user to approve or request changes (with room for free-text feedback).
**Done when:** the user explicitly approves. Generate nothing before that.

**Shot = clip.** The video model produces clips of exactly 4, 5, 6, or 10 seconds (default 4). Plan one shot per clip and choose durations so the total is close to the target. A total 1 to 3 seconds over is normal and preferred over cutting speech.
**Word budget:** at most 2.5 spoken words per second of clip length (4s ≈ 10 words, 5s ≈ 12, 6s ≈ 15, 10s ≈ 25).

### Stage 2: Visual assets

Create the still images the video is generated from. What to create (a single presenter anchor, one still per shot, product stills) is defined by the selected type. Every image prompt must follow the type's image rules, and must contain no text, captions, logos, or watermarks.

Call the native `generate_image` tool:
- `prompt`: Detailed prompt describing the scene, lighting, setting, and subject.
- `file_path`: Destination file path (e.g. `images/presenter_anchor.png`).
- `aspect_ratio`: "9:16", "16:9", or "1:1".

If the user uploaded an image the type can use, use it instead of generating, but still show it for approval. Show generated images in chat and ask the user to approve or request changes.
**Done when:** the user explicitly approves.

### Stage 3: Motion (and speech, if the type uses it)

Generate one clip per shot from the approved still using the native `generate_video` tool:
- `image_path`: Path to the anchor image (`images/presenter_anchor.png` or `sha256:...`).
- `prompt`: Motion description prompt for this shot.
- `script`: Exact spoken dialogue for the shot (coordinates natural lip synchronization and mouth movements).
- `duration`: 4, 5, 6, or 10 seconds.
- `aspect_ratio`: "9:16", "16:9", or "1:1".
- `output_path`: Destination path for this shot clip (e.g. `output/shot1.mp4`).

- The motion prompt describes only movement for that shot, kept simple and consistent.
- Speech and lip sync are generated natively with the clip. No separate voiceover is needed for spoken shots.
- Pass the approved spoken line exactly as written.
- Keep every clip at its full length. Check durations with `ffprobe`, one file per call.

**Done when:** every shot has a clip.

### Stage 4: Voice change or dubbing (optional)

Skip unless the user chose a different tone, accent, or language in Stage 0, or asks for it later. Use the same voice on every shot.

**Tone or accent change, same language.** Preserves timing and lip sync exactly. No lip-sync step needed. Call the native `convert_voice` tool:
- `input_path`: Path to input video or audio clip.
- `output_path`: Destination path for converted clip.
- `voice`: One of `shivraj`, `dr-joshi`, `shlok`, `manish`, `kalyan`, `surabhi`, `vanishree`.

**Different language (for example Hindi).** Timing changes, so run the lip-sync step on the dubbed result before assembly. Call the native `dub_audio` tool:
- `script`: Phonetically normalized dialogue text.
- `output_path`: Destination path for dubbed audio.
- `voice`: One of `aarav`, `rushi`, `lovinder`, `mohit`, `shivraj`.
- `target_duration`: Video duration in seconds.

Write brand names, URLs, and currency phonetically in dubbing text: "GrowEasy dot AI", "dot com", "10000 rupees".

**Tone voices:** `shivraj` energetic Indian English, direct response · `shlok` young friendly creator, SaaS and apps · `manish` clear grounded explainer · `dr-joshi` deep authoritative, medical, finance, luxury · `kalyan` South Indian English · `surabhi` warm female, lifestyle · `vanishree` expressive South Indian female.
**Dubbing voices (Hindi):** `aarav` high-energy male · `rushi` expressive commercial · `lovinder` Hindi and Hinglish narrator · `mohit` professional, B2B and fintech · `shivraj` energetic.

### Stage 5: Captions and assembly

1. **Captions:** Call the native `render_captions` tool to burn dynamic captions onto the video:
   - `video_path`: Path to the video clip.
   - `output_path`: Destination path for captioned video.
   - `style`: "karaoke" (default), "pop", or "highlight".
   - `highlight_color`: "yellow" (default), "cyan", "green", "orange", or "white".
   - `position`: "chest" (default 55% safe zone).
   - If `captions` is omitted, the tool automatically transcribes speech from the video audio.
2. **Type overlays:** apply the overlays the type defines (punch-ins, offer banner, end card).
3. **Stitch:** Call the native `render_video` tool with soft cross-dissolve transitions:
   - `clips`: Array of shot video paths in sequence.
   - `output_path`: Destination path for the stitched video (e.g. `output/final_reel.mp4`).
   - `transition`: "fade" (default), "slideleft", or "smoothleft".
   - `transition_duration`: 0.3.
   - `voiceover_path`: Optional voiceover audio path.
   - `music_path`: Optional background music path (auto-ducked -18dB).

Cut offsets: first cut = shot 1 duration − 0.3. Each later cut = previous offset + next shot duration − 0.3.
Transitions: `fade` (0.25 to 0.3s) default · `slideleft` (0.2 to 0.25s) into a product mention · `smoothleft` (0.25s) for fast-paced videos.

### Stage 6: Deliver

Clean up any remaining temporary files in `../tmp/`. Native media tools automatically store finished outputs in the content-addressed attachment store (`.dsh/attachments/`) and return interactive media cards in the chat UI. If a specific deliverable file is requested, declare it using the `present` tool (`present({ files: [{ path: '<output_path>', description: 'Final video' }] })`). Show a one-line summary (length, ratio, language). Offer quick changes (script line, voice, captions, ratio) through the question tool. Re-run only the affected stage.

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
| 1 Script | Yes | Use the beat list below |
| 2 Visual assets | Yes | One master presenter anchor, used for all shots |
| 3 Motion and speech | Yes | Every shot is spoken, native speech |
| 4 Voice | Optional | |
| 5 Assembly | Yes | Captions, punch-ins, offer banner, end card |

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
