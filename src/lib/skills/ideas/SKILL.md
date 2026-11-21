---
name: ideas
description: "Daily idea scout for the Ad Creator. Reads competitor research, inspects the winning competitor ads, and reads our creatives, campaigns, alerts, and suggestions. Then saves a ranked backlog of up to 10 evidence-backed ad ideas, each with its reference ad."
---

## Rules

- **Every idea is an ad idea.** If it comes from a competitor ad or one of our winners, save that ad's media on the card. A card without its ad renders as plain text.
- **Inspect before ideating.** View the winning ads (videos and images) before turning them into ideas. Never build an idea on a pattern from an ad you did not view.
- **Patterns over one-offs.** A pattern appears in 2 or more inspected ads. A single ad is a signal, and the card says so.
- **Read the backlog first.** Page `ideas` until exhausted. Never repeat an idea already there by title, hook, or core angle. Near-duplicates count.
- **Up to 10 ranked cards, strongest first.** Fewer is fine when the evidence is thin. Never pad. Rank by expected impact, fit with live campaigns, and how cheaply it can be produced.
- **Evidence on every card.** Name where the idea came from.
- **Remake structure, never assets.** Borrow the angle, hook, pacing, and proof device. Never copy a competitor's script, visuals, logo, or claims.
- **Daily cadence.** A second run on the same day adds only genuinely new ideas.
- **Not this skill:** finished assets are `creatives`; daily reporting is `reports`; account diagnostics are `alerts`.

## Clarifications

- Format unspecified: mix video and image and let the ranking decide the split. If the user asks for static or video, use only that format.
- Single theme requested (for example "retargeting"): still read all the context, then rank within that theme.
- Missing profile or campaign data: say so in one line and use the lists that exist.
- Vague request: ask one question with a multi-select block: video-first, image-first, or balanced.

## Guardrails

- No fabricated evidence. Never state a competitor result, CTR, ROAS, or spend that was not read from a list or a verified source.
- No performance promises. Say why an idea should work, never a guaranteed uplift.
- No Ad Library links and no links to competitor ads in any field or text.
- No tool talk: no tool names or cursors in user-facing text.
- At most 10 per call. Hold extras for the next refresh.

## Execution Workflow

### Step 1: Load the context

Use `fetchDetailBar` with small limits, and page only where the decision needs older rows:

1. `competitorResearches` (latest 1-2): verified winners with angle, hook, offer, and days live.
2. `creatives` (latest 10): what we already made, so ideas don't repeat assets.
3. `campaigns` (latest 5): what is running, what won, what failed.
4. `alerts` and `suggestions` (active): fatigue, saturation, landing-page mismatch, and growth openings.
5. `ideas` (all, paged): the current backlog.

### Step 2: Study the competitor ads

- Pick up to 5 verified winners from the research, long-running first, then potential. Prefer ads for the same product, category, or objective as our live campaigns.
- View every video and image before using it. If an ad can't be opened, leave it out.
- For each ad, note: the hook (first 3 seconds or headline), the angle, the structure (order of beats), the proof device, the offer framing and CTA, and the format, length, and language.
- Find the patterns: what repeats in 2 or more ads, and what none of them show (our gap).
- Keep each ad's media URL exactly as returned, and verify its aspect ratio (9/16, 4/5, 1/1, 16/9, or 3/2).

### Step 3: Find the four kinds of signal

- A competitor pattern or winner that is absent from our backlog (`COMPETITOR WINNER`).
- One of our winners whose winning element can become a new idea (`OUR WINNER`).
- A variant of an existing creative, with the change named (`VARIANT`).
- A gap in the research about audience, offer, or proof, or an alert / suggestion opening (`FROM INSIGHTS`).

### Step 4: Write each card

Each card fills these fields. This is what the UI renders.

| Field         | What to write                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | 8 words or fewer. The idea in plain words.                                                                                                                                                                |
| `description` | 20-40 words. Why it should work, tied to the evidence: the pattern, its count, and the gap it fills. Never a promise.                                                                                     |
| `source`      | One of `COMPETITOR WINNER`, `OUR WINNER`, `FROM INSIGHTS`, `VARIANT`. Rendered as the card chip; never invent a new value.                                                                                |
| `format`      | `video` or `image`. It picks the preview component.                                                                                                                                                       |
| `hook`        | The opening line or first 3 seconds of the ad we would make, in our words.                                                                                                                                |
| `why`         | One line: what we make (the asset and its core beat).                                                                                                                                                     |
| `makeFor`     | The audience or funnel stage.                                                                                                                                                                             |
| `mediaUrl`    | The reference ad's own https URL (a competitor's or ours), or an `/api/attachments/…` URL when a tool produced it. Exactly as returned. Omit for ideas with no reference ad (insight, alert, suggestion). |
| `aspectRatio` | The verified ratio of `mediaUrl`. Omit if there is no `mediaUrl`.                                                                                                                                         |
| `sourceUrl`   | Only our own ad's URL when the reference is ours. Leave empty for competitor ads.                                                                                                                         |

Rules for the content:

- The hook, title, and copy are original wording for our brand, in our product, proof, and language. Never reuse a competitor's words.
- A competitor-based card says which pattern it remakes in `description` (for example "question hook plus real founder, seen in 3 of 5 winners").
- A card built on a single ad says "single signal".
- Don't plan something we already made. If the idea is a variant of an existing creative, use `VARIANT` and say what changes.

### Step 5: Rank and save

- Rank by expected impact, fit with live campaigns, and production cost.
- Save with `updateIdeas`. Omit `id` for new cards. Pass an existing `id` only to update a backlog item deliberately.
- If saving fails, say so. Never present a saved state that did not happen.
- Never write idea JSON in the chat reply.

## Reference example

One saved card, as an illustration. Borrow the density and wording style. Don't copy the content. All names, numbers and URLs are illustrative.

```json
{
  "title": "Do You Know When Your Oil Was Pressed?",
  "description": "Question hooks that make buyers doubt their current product run in 3 of 5 inspected winners, and none show a press date. Our press date fills that gap.",
  "source": "COMPETITOR WINNER",
  "format": "video",
  "hook": "Do you know when your oil was pressed?",
  "why": "A 15s UGC video: the question, the bottle's press date, then the Diwali gift box.",
  "makeFor": "Women 30-50, Karnataka and Tamil Nadu, cold audience",
  "mediaUrl": "https://cdn.example.com/competitor-winner.mp4",
  "aspectRatio": "9/16"
}
```

An idea with no reference ad (from insights) omits `mediaUrl`, `aspectRatio` and `sourceUrl`:

```json
{
  "title": "Fresh Hook For Tiring Unboxing Video",
  "description": "Frequency on the unboxing winner passed 2.5 and CTR is falling. A new first 3 seconds keeps the proven structure.",
  "source": "FROM INSIGHTS",
  "format": "video",
  "hook": "Day 1 of Diwali: three oils, one box.",
  "why": "Re-cut the unboxing winner with a new opening shot and the same offer.",
  "makeFor": "Existing winning audience, retargeting"
}
```

## Before saving

- Every card is a new idea, not in the backlog by title, hook, or angle.
- Every competitor-based card comes from ads you inspected, and `mediaUrl` and `aspectRatio` are set and unchanged.
- No competitor words, assets, or links anywhere.
- No invented numbers. No guaranteed results.
- Ranked strongest first, 10 or fewer.
