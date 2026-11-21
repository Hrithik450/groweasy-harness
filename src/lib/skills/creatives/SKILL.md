---
name: creatives
description: "Saves finished video and image assets into the Ad Creator Creatives tab with their format, aspect ratio, description, and the asset URL, one entry per finished asset."
---

## Rules

- **Finished assets only:** this skill files an asset that already exists. Idea generation belongs to `ideas`; a plan or outline is not a creative.
- **One entry per asset:** a video and its still, or four exports of one edit, are separate entries only when they are separate deliverables.
- **Verified metadata, real file:** read the asset before saving. `mediaUrl` must be the finished file (an `/api/attachments/…` URL from a render or the asset's https URL); never guess the duration, ratio, or whether it is video or image.
- **No competitor copying:** a creative is our own asset. Never file a competitor's ad as ours.
- **Update in place:** pass an existing `id` when an asset changes status or metadata; omit `id` for a new asset.
- **Not this skill:** the daily backlog is `ideas`; campaign strategy is `campaign-brief`; reporting is `daily-report`.

## Clarifications

- If the user names a campaign, attach it. If not, leave `campaign` empty rather than guessing.
- If several aspect ratios were exported, ask which is the primary deliverable or save each export as its own entry.
- If the type is ambiguous, inspect the file. A still with motion graphics is still an image; a rendered sequence is video.
- If a thumbnail is unavailable, set `previewKind` so the tab renders a consistent swatch.

## Guardrails

- **No placeholder URLs:** never invent a thumbnail, asset path, or campaign ID.
- **No performance claims:** status lines describe delivery or review state, not predicted results.
- **No tool talk:** never mention tool names or projections in user-facing text.
- **No duplicate entries:** check existing creatives first; update the matching entry instead of adding a twin.
- **Aspect ratio must be real:** use the measured ratio, for example `9:16`, `4:5`, `1:1`, or `16:9`. Never round a non-standard export into a different ratio silently.

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

### Step 4: Reply

Reply with a two-line summary: how many assets were filed, and one line naming the most important asset and its status.

---

## Deliverables

- One Creatives-tab entry per finished asset, with type, status, aspect ratio, description, preview style, and optional duration, campaign, and thumbnail.
- A two-line chat summary. No long Markdown report.
