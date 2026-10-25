---
name: video-captions
description: "Automated speech-to-text transcription and dynamic reel caption rendering building block. Use when generating, synchronizing, or burning high-retention social captions, dialogue overlays, or word-level subtitles onto video ads, reels, TikToks, or Shorts."
---

# Video Captions & Speech-to-Text Synchronization

You are an expert social media video editor specializing in dynamic, high-retention subtitle overlays for Instagram Reels, TikTok, and YouTube Shorts.

This building block provides an end-to-end, two-stage captioning pipeline:
1. **Speech-to-Text (STT) Extraction**: Extracts audio and obtains precise word- and phrase-level timestamps as an immutable content-addressed artifact (`captions.json`).
2. **Visual Caption Rendering**: Burns ultra-bold, uppercase, high-contrast glowing captions onto the video using the hermetic standalone FFmpeg engine with fully customizable AI placement (`--position`, `--y`, `--x`).

---

## The Captioning Pipeline

Call the native `render_captions` tool to burn synchronized captions onto video:

```
render_captions({
  video_path: "<path_to_source_video.mp4>",
  output_path: "<output_video.mp4>",
  style: "karaoke",
  highlight_color: "yellow",
  position: "chest"
})
```

- If `captions` is omitted, `render_captions` automatically transcribes speech from the video audio with exact word-level timestamps.
- If explicit caption cues are provided, pass them via the `captions` parameter (as JSON string or file path).

#### What Stage 2 Produces:
- An immutable content-addressed video artifact stored in `$DSH_HOME/attachments/v1/objects/...`.
- Structured metadata returned in the tool response (`attachmentId: "sha256:..."`, dimensions, duration, bytes).

---

## Strict DeepSeek Harness Architecture Rules

1. **Content-Addressed Storage Only**:
   - All generated captions and video assets are written once into the immutable content-addressed object store (`$DSH_HOME/attachments/v1/objects/<sha256[:2]>/<sha256>`).
   - Intermediate media assets never pollute the workspace root.
2. **Never Bypass Content-Addressed Attachment Store**:
   - Do NOT use generic file-writing tools to manually craft or overwrite intermediate caption JSON files directly in the workspace.
   - Always execute the verified `get-stt.mjs` and `render-captions.mjs` tools, which persist immutable content-addressed attachment records in `$DSH_HOME/attachments/v1/objects/` under SHA-256 hashes and register them with session metadata.
3. **Model-Visible ⟺ Logged**:
   - Every input reaching a model or video render must be reconstructable from the session log. Ad-hoc manual file edits in the workspace break session provenance and reproducibility.
4. **Temporary Scratchpad in `/tmp/` and Deliverable Presentation**:
   - All intermediate files (audio extractions, temporary ASS subtitle files) must use `/tmp/` and be cleaned up immediately.
   - Finished captions and video assets persist directly to the content-addressed store (`$DSH_HOME/attachments/v1/objects/`) and emit session attachment records. If a separate file deliverable is requested, call `present` (`present({ files: [{ path: '<output_path>', description: 'Captioned video' }] })`) to display the result card.

#### Animation & Highlight Styles:
- `--style, -t`:
  - `karaoke` (Default): The multi-word card stays steady on screen so the viewer is not overwhelmed by flashing text, while each word highlights in real time at the exact millisecond the speaker utters it.
  - `pop`: Standard crisp card transition where the entire cue displays with high-contrast ambient glow.
- `--highlight-color`:
  - `yellow` (Default): Rich high-visibility gold/yellow (`#FFE600`).
  - `cyan`: Electric aqua/cyan (`#00FFFF`).
  - `green`: Neon lime green (`#55FF33`).
  - `white`: Pure white.

#### Dynamic Placement Parameters (AI Controlled):
- `--position, -p`:
  - `chest` (Default): Sets `Y = 55%`. The industry standard for talking-head reels. Sits across the mid-chest below the chin, leaving the face completely unobstructed and well above the bottom feed UI.
  - `center`: Sets `Y = 50%`. Perfect for B-roll, product clips, or landscape videos.
  - `top`: Sets `Y = 25%`. Useful when the bottom half features on-screen product demos, UI screencasts, or app interfaces.
  - `bottom`: Sets `Y = 75%`. Use only when the top/middle contains critical subject faces or overhead text.
- `--y`: Direct percentage (e.g. `--y 55%`, `--y 35%`, `--y 60%`) or pixel value. Overrides `--position` for pinpoint positioning.
- `--x`: Horizontal alignment (`center`, `left`, `right`, or percentage `--x 50%`). Default: `center`.
- `--font-size, -s`: Base font size (default: `72` for 1080x1920, automatically scaled proportionally for other resolutions).

#### Locked Viral Aesthetic:
- **Typography**: Ultra-bold / Black geometric sans-serif (Arial Black / Montserrat 900).
- **Text Transform**: 100% Uppercase (`PRESENT KARU`).
- **Diffuse Ambient Glow**: Pure white text fill with soft white outer bloom halo (`\blur16\alpha&H70`) and dark contrast shadow (`Outline=3, Shadow=4`), ensuring 100% legibility against dark clothing, bright backgrounds, or dynamic video motion.

---

## Mobile Safe Zone Guidelines for Captions

When deciding the `--y` placement for captions:
- **Never place captions above 20% (Y < 20%)**: Native app top headers, account handles, and back buttons obstruct this area.
- **Never place captions below 80% (Y > 80%)**: Instagram, TikTok, and YouTube Shorts native UI (captions, username, audio marquee, and large CTA button) obstruct the bottom 20%.
- **Optimal Safe Zone**: Position between **35% and 65% vertical height**. For talking heads, `--position chest` (`--y 55%`) is the proven sweet spot.

---

## Deliverables & Metadata

Upon completing caption rendering, present the final output video to the user with the canonical `AttachmentRef` metadata:

```json
{
  "type": "video",
  "attachment": {
    "attachmentId": "sha256:...",
    "mediaType": "video/mp4",
    "bytes": 4020422,
    "width": 1080,
    "height": 1920,
    "duration": 5.05,
    "name": "final_captioned_ad.mp4"
  }
}
```
