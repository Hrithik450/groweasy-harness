---
name: creatives
description: "Saves finished video and image assets into the session with their format, aspect ratio, description, and the asset URL, one entry per finished asset."
---

## Rules

- **Finished assets only:** this skill files an asset that already exists. Idea generation belongs to `ideas`; a plan or outline is not a creative.
- **One entry per asset:** a video and its still, or four exports of one edit, are separate entries only when they are separate deliverables.
- **Verified metadata, real file:** read the asset before saving. `mediaUrl` must be the finished file (an `/api/attachments/…` URL from a render or the asset's https URL); never guess the duration, ratio, or whether it is video or image.
- **Update in place:** pass an existing `id` when an asset changes status or metadata; omit `id` for a new asset.

## Clarifications

- If the user names a campaign, attach it. If not, leave `campaign` empty rather than guessing.
- If several aspect ratios were exported, ask which is the primary deliverable or save each export as its own entry.
- If the type is ambiguous, inspect the file. A still with motion graphics is still an image; a rendered sequence is video.

## Guardrails

- **No performance claims:** status lines describe delivery or review state, not predicted results.
- **No tool talk:** never mention tool names or projections in user-facing text.
- **No duplicate entries:** check existing creatives first; update the matching entry instead of adding a twin.
- **Aspect ratio must be real:** use the measured ratio, for example `9:16`, `4:5`, `1:1`, or `16:9`. Never round a non-standard export into a different ratio silently.
- **Reference fidelity before filing:** when the asset is a clone or is derived from a reference, open the reference and the finished asset and compare composition and alignment. File it only if it matches; never label a freehand asset as a clone.

## Execution Workflow

### Step 1: Confirm the asset

- Identify the file or URL, its type, and whether it is final.
- Inspect it with `readVideos`, `readImages`, or `ffmpeg` to confirm duration and aspect ratio when the signal is incomplete.
- Read the `creatives` list with `fetchDetailBar` to find an existing entry for the same asset.

### Step 2: Describe the asset

- Write a title of six words or fewer.
- Describe what the asset shows in 15-30 words: product, hook, and main beat.
- Choose `previewKind` from `ink`, `brand`, `accent`, or `tan` when there is no thumbnail.
- Add `duration` for video and `campaign` when the destination is known.

### Step 3: Set status and save

- Use `Ready` only for a finished, reviewed asset; use `Draft` otherwise.
- Add `statusLine` for a short delivery or review note, and `isLive` only when the asset is actually running.
- Save with `updateCreatives`. Omit `id` for a new asset; pass the existing `id` to update one in place.
