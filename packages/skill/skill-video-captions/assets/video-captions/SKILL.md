---
name: video-captions
description: "Video post-production subtitle specialist that transcribes dialogue, normalizes lowercase ASS cues, and burns captions into video ads via createSubtitles, saveAsset, and ffmpeg."
---

## Rules

- **Strict lowercase:** Every caption uses lowercase letters only (e.g. `tired of junk property leads?`). Never capital letters anywhere.
- **Style:** White fill (`#FFFFFF` / `&H00FFFFFF&`) with a thick dark navy outline (`#0a1f48` / `&H00481F0A&`). Numbers, handles, and currencies stay simple: `10k`, `50% off`, `₹99`, `whatsapp`, `groweasy.ai`.
- **Trim hesitations:** Remove `um`, `uh`, `like`, and stutters from the `.ass` script without moving the timing cues.
- **Safe zone:** Default `position: 60` — below the chin on 9:16, clear of Reels/TikTok bottom overlays.
- **Chain:** `createSubtitles` → normalize script → `saveAsset` → burn with `ffmpeg`.

## Prerequisites

- Dialogue audio and target video were produced or inspected earlier, so each is available as an attachment id (`sha256:<hex>`) or `/api/attachments/<attachmentId>` URL.

## Clarifications

- For split screens, bottom infographics, or non-standard layouts, confirm the vertical caption position.

## Guardrails

- **No capitals:** Uppercase must never appear in subtitle text.
- **No timestamp drift:** Wording edits preserve each cue's start and end timestamps.
- **Attachment references only:** pass the id or `/api/attachments/<attachmentId>` URL the previous tool returned. Do not construct paths and do not pass remote URLs to media tools.

---

## Execution Workflow

### Step 1: Transcribe (`createSubtitles`)

`createSubtitles({ audioPath: "<audioAttachmentId>", position: 60, storage: "tmp" })` returns the `.ass` delivery URL in `attachmentUrl` plus a text preview of the cues.

### Step 2: Normalize

Inspect each cue; enforce lowercase across words, names, brands, and punctuation; remove fillers; keep timestamps aligned.

### Step 3: Save (`saveAsset`)

`saveAsset({ content: "...", type: "file", storage: "tmp" })` returns a new `.ass` delivery URL in `attachmentUrl`.

### Step 4: Burn (`ffmpeg`)

Burn with the `subtitles` filter; write the final MP4 with `storage: "artifact"`.

```bash
-i /api/attachments/<videoAttachmentId> -vf subtitles=/api/attachments/<captionsAttachmentId> -c:a copy
```

---

## Caption Reference

```ini
Dialogue: 0,0:00:01.00,0:00:03.20,Default,,0,0,0,,tired of junk property leads?
Dialogue: 0,0:00:03.40,0:00:05.80,Default,,0,0,0,,here is how top brokers close faster
```

- **9:16 Reels / Stories:** `position: 60`.
- **1:1 Feed:** `position: 75`.
- **16:9 Landscape:** `position: 80`.

---

## Deliverables

- `.ass` intermediate and final MP4 are attachments; mark the MP4 `artifact` and deliver it in a `<ui-block>` `Video` using its `/api/attachments/<attachmentId>` URL.
